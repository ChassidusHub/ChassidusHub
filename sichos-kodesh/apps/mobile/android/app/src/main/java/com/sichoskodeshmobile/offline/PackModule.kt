package com.sichoskodeshmobile.offline

import android.app.Activity
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.os.Build
import android.os.StatFs
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import org.json.JSONObject

/**
 * Offline packs and shared files, streamed - never held in memory whole.
 *
 * JS name: `SichosKodeshPacks`. Everything that touches bytes runs on one
 * background thread, in order. JS decides what to import (it verifies the
 * manifest's signature and computes the delta with packages/pack-format);
 * this side streams the ZIP once, hashes every file it writes, and only
 * moves a file into place when its SHA-256 and size are what JS expected.
 * Files land at the same app-private paths the downloader writes to, so
 * every screen that shows "downloaded" works unchanged.
 *
 * Paths given as `dest` are relative to the app's files directory.
 *
 * Events: `SichosKodeshPackProgress` -> { jobId, bytes, total }.
 */
class PackModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), ActivityEventListener {

    companion object {
        const val NAME = "SichosKodeshPacks"
        const val EVENT_PROGRESS = "SichosKodeshPackProgress"
        private const val REQUEST_PICK_FILES = 7301
        private const val REQUEST_PICK_FOLDER = 7302
        private const val BUFFER = 64 * 1024
        private const val PROGRESS_STEP = 1024 * 1024L
        private const val STAGING_DIR = "import-staging"
    }

    private val io = Executors.newSingleThreadExecutor()
    /** Searches run apart from imports, so a long import never holds a search up. */
    private val searchIo = Executors.newSingleThreadExecutor()
    private var pendingPick: Promise? = null

    init {
        context.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    // ── Reading packs and ZIPs ────────────────────────────────────────────────

    /**
     * The text of one entry (the manifest, objects.json, catalog.json), or
     * null when the ZIP has no such entry. With `mustBeFirst`, only the first
     * entry is looked at: a pack's manifest is always first.
     */
    @ReactMethod
    fun readEntry(uri: String, name: String, mustBeFirst: Boolean, maxBytes: Double, promise: Promise) = background(promise, "READ_ENTRY_FAILED") {
        findEntryText(uri, name, mustBeFirst, maxBytes.toLong())
    }

    private fun findEntryText(uri: String, name: String, mustBeFirst: Boolean, maxBytes: Long): String? {
        ZipInputStream(BufferedInputStream(open(uri), BUFFER)).use { zip ->
            var index = 0
            while (true) {
                val entry = zip.nextEntry ?: return null
                if (entry.name == name) return readLimited(zip, maxBytes).toString(Charsets.UTF_8)
                if (mustBeFirst && index == 0) return null
                index += 1
            }
        }
    }

    /**
     * Streams a pack once and writes the entries JS asked for, each verified
     * by SHA-256 and size before it is moved into place. Items:
     * `{ entry, dest, sha256?, bytes? }`. Resolves one result per item:
     * `{ entry, dest, ok, sha256, bytes, error? }`.
     */
    @ReactMethod
    fun importEntries(uri: String, jobId: String, items: ReadableArray, promise: Promise) = background(promise, "IMPORT_FAILED") {
        val wanted = HashMap<String, JobItem>()
        var total = 0L
        for (i in 0 until items.size()) {
            val item = items.getMap(i) ?: continue
            val entry = item.getString("entry") ?: continue
            val dest = safeRelative(item.getString("dest") ?: continue)
            val bytes = if (item.hasKey("bytes") && !item.isNull("bytes")) item.getDouble("bytes").toLong() else -1L
            val sha = if (item.hasKey("sha256") && !item.isNull("sha256")) item.getString("sha256") else null
            wanted[entry] = JobItem(entry, dest, sha, bytes)
            if (bytes > 0) total += bytes
        }
        val results = Arguments.createArray()
        val progress = Progress(jobId, total)
        ZipInputStream(BufferedInputStream(open(uri), BUFFER)).use { zip ->
            while (wanted.isNotEmpty()) {
                val entry = zip.nextEntry ?: break
                val item = wanted.remove(entry.name) ?: continue
                results.pushMap(writeVerified(zip, item, progress))
            }
        }
        for (item in wanted.values) results.pushMap(result(item, false, null, 0, "not in the pack"))
        progress.finish()
        results
    }

    /** Every file entry of a ZIP with its size, for identifying a shared ZIP before importing it. */
    @ReactMethod
    fun listEntries(uri: String, promise: Promise) = background(promise, "LIST_ENTRIES_FAILED") {
        val entries = Arguments.createArray()
        ZipInputStream(BufferedInputStream(open(uri), BUFFER)).use { zip ->
            val buffer = ByteArray(BUFFER)
            while (true) {
                val entry = zip.nextEntry ?: break
                if (entry.isDirectory) continue
                var size = entry.size
                if (size < 0) {
                    size = 0
                    while (true) {
                        val n = zip.read(buffer)
                        if (n < 0) break
                        size += n
                    }
                }
                entries.pushMap(Arguments.createMap().apply {
                    putString("path", entry.name)
                    putDouble("bytes", size.toDouble())
                })
            }
        }
        entries
    }

    /**
     * Copies every file of a shared ZIP (or a picked folder, `folderUri`) into
     * a staging area, hashing on the way: JS then identifies each by hash and
     * name, and commits or discards it. Resolves `{ path, staged, sha256, bytes }[]`.
     */
    @ReactMethod
    fun stageZip(uri: String, jobId: String, promise: Promise) = background(promise, "STAGE_FAILED") {
        val staged = Arguments.createArray()
        val progress = Progress(jobId, 0)
        val dir = stagingDir()
        var n = 0
        ZipInputStream(BufferedInputStream(open(uri), BUFFER)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (entry.isDirectory) continue
                val target = File(dir, "${n++}.tmp")
                val (sha, bytes) = copyHashing(zip, target, progress)
                staged.pushMap(Arguments.createMap().apply {
                    putString("path", entry.name)
                    putString("staged", "$STAGING_DIR/${target.name}")
                    putString("sha256", sha)
                    putDouble("bytes", bytes.toDouble())
                })
            }
        }
        progress.finish()
        staged
    }

    @ReactMethod
    fun stageFolder(treeUri: String, jobId: String, promise: Promise) = background(promise, "STAGE_FAILED") {
        val root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri)) ?: throw FileNotFoundException(treeUri)
        val staged = Arguments.createArray()
        val progress = Progress(jobId, 0)
        val dir = stagingDir()
        var n = 0
        fun walk(folder: DocumentFile, prefix: String) {
            for (child in folder.listFiles()) {
                val name = child.name ?: continue
                if (child.isDirectory) {
                    walk(child, "$prefix$name/")
                } else if (child.isFile) {
                    val target = File(dir, "${n++}.tmp")
                    val (sha, bytes) = (context.contentResolver.openInputStream(child.uri) ?: continue).use { copyHashing(it, target, progress) }
                    staged.pushMap(Arguments.createMap().apply {
                        putString("path", "$prefix$name")
                        putString("staged", "$STAGING_DIR/${target.name}")
                        putString("sha256", sha)
                        putDouble("bytes", bytes.toDouble())
                    })
                }
            }
        }
        walk(root, "")
        progress.finish()
        staged
    }

    /** Moves a staged file to its place (`dest`, relative to the files directory). */
    @ReactMethod
    fun commitStaged(staged: String, dest: String, promise: Promise) = background(promise, "COMMIT_FAILED") {
        val from = File(context.filesDir, safeRelative(staged))
        val to = File(context.filesDir, safeRelative(dest))
        to.parentFile?.mkdirs()
        moveInto(from, to)
        to.absolutePath
    }

    /** Deletes everything still staged (the files no one identified). */
    @ReactMethod
    fun clearStaging(promise: Promise) = background(promise, "CLEAR_FAILED") {
        File(context.filesDir, STAGING_DIR).deleteRecursively()
        null
    }

    @ReactMethod
    fun hashFile(path: String, promise: Promise) = background(promise, "HASH_FAILED") {
        val digest = MessageDigest.getInstance("SHA-256")
        var bytes = 0L
        FileInputStream(File(path.removePrefix("file://"))).use { input ->
            val buffer = ByteArray(BUFFER)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
                bytes += n
            }
        }
        Arguments.createMap().apply {
            putString("sha256", hex(digest.digest()))
            putDouble("bytes", bytes.toDouble())
        }
    }

    // ── Searching a sefer ─────────────────────────────────────────────────────

    /**
     * Searches one work's index (a text pack's `search` object, an SQLite
     * FTS4 database under `indexes/`, relative to the files directory) with
     * Android's own SQLite, read-only. `match` is an FTS query built by
     * pack-format's `searchIndexQuery`. The query below is pack-format's
     * `SEARCH_INDEX_QUERY` for index format 1; an index of another format is
     * refused rather than misread. Resolves `{ unit, source }[]` in reading
     * order.
     */
    @ReactMethod
    fun searchIndex(dest: String, match: String, limit: Double, promise: Promise) {
        searchIo.execute {
            try {
                val file = File(context.filesDir, safeRelative(dest))
                val rows = Arguments.createArray()
                SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS).use { db ->
                    val format = db.rawQuery("SELECT value FROM meta WHERE key = 'format'", null).use { if (it.moveToFirst()) it.getString(0) else null }
                    if (format != "1") throw IllegalStateException("search index format $format")
                    val max = limit.toInt().coerceIn(1, 500)
                    db.rawQuery("SELECT rows.unit, rows.source FROM search JOIN rows ON rows.id = search.docid WHERE search MATCH ? ORDER BY rows.id LIMIT $max", arrayOf(match)).use { cursor ->
                        while (cursor.moveToNext()) {
                            rows.pushMap(Arguments.createMap().apply {
                                putString("unit", cursor.getString(0))
                                putInt("source", cursor.getInt(1))
                            })
                        }
                    }
                }
                promise.resolve(rows)
            } catch (e: Exception) {
                promise.reject("SEARCH_FAILED", e.message ?: "SEARCH_FAILED", e)
            }
        }
    }

    /**
     * Builds a search index on the phone, for a sefer saved from its source
     * rather than imported in a pack. `rowsFile` (relative to the files
     * directory) holds one JSON object per line - `{ unit, source, title,
     * body }`, the title and body already normalised by pack-format - and
     * `sql` is pack-format's `SEARCH_INDEX_SQL`, so both builders make the
     * same layout. The database is written beside `dest` and moved into
     * place whole; the rows file is deleted. Resolves the number of rows.
     */
    @ReactMethod
    fun buildSearchIndex(rowsFile: String, dest: String, sql: ReadableArray, meta: ReadableMap, promise: Promise) = background(promise, "BUILD_INDEX_FAILED") {
        val rows = File(context.filesDir, safeRelative(rowsFile))
        val target = File(context.filesDir, safeRelative(dest))
        val partial = File(target.path + ".partial")
        target.parentFile?.mkdirs()
        partial.delete()
        File(partial.path + "-journal").delete()
        var count = 0
        try {
            SQLiteDatabase.openOrCreateDatabase(partial, null).use { db ->
                for (i in 0 until sql.size()) db.execSQL(sql.getString(i))
                val iterator = meta.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    db.execSQL("INSERT INTO meta (key, value) VALUES (?, ?)", arrayOf(key, meta.getString(key)))
                }
                val putRow = db.compileStatement("INSERT INTO rows (id, unit, source) VALUES (?, ?, ?)")
                val putText = db.compileStatement("INSERT INTO search (docid, title, body) VALUES (?, ?, ?)")
                db.beginTransaction()
                try {
                    rows.bufferedReader().useLines { lines ->
                        for (line in lines) {
                            if (line.isBlank()) continue
                            val row = JSONObject(line)
                            count += 1
                            putRow.clearBindings()
                            putRow.bindLong(1, count.toLong())
                            putRow.bindString(2, row.getString("unit"))
                            putRow.bindLong(3, row.getLong("source"))
                            putRow.executeInsert()
                            putText.clearBindings()
                            putText.bindLong(1, count.toLong())
                            putText.bindString(2, row.getString("title"))
                            putText.bindString(3, row.getString("body"))
                            putText.executeInsert()
                        }
                    }
                    db.setTransactionSuccessful()
                } finally {
                    db.endTransaction()
                }
                db.execSQL("INSERT INTO search(search) VALUES ('optimize')")
            }
            File(partial.path + "-journal").delete()
            moveInto(partial, target)
        } finally {
            partial.delete()
            rows.delete()
        }
        count
    }

    // ── The shared folder (Storage Access Framework) ──────────────────────────

    /** The system picker for one or more files; resolves their content URIs, or null when cancelled. */
    @ReactMethod
    fun pickFiles(promise: Promise) {
        startPicker(promise, REQUEST_PICK_FILES, Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        })
    }

    /** The system folder picker; the grant is kept across restarts. Resolves the tree URI, or null. */
    @ReactMethod
    fun pickFolder(promise: Promise) {
        startPicker(promise, REQUEST_PICK_FOLDER, Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        })
    }

    /** Whether the app still holds the grant for a folder the user picked. */
    @ReactMethod
    fun hasFolderAccess(treeUri: String, promise: Promise) {
        promise.resolve(context.contentResolver.persistedUriPermissions.any { it.uri.toString() == treeUri && it.isReadPermission && it.isWritePermission })
    }

    /** The files of `subdir` inside the picked folder (created when missing): `{ name, uri, bytes }[]`. */
    @ReactMethod
    fun listFolder(treeUri: String, subdir: String, promise: Promise) = background(promise, "LIST_FOLDER_FAILED") {
        val dir = folder(treeUri, subdir) ?: throw FileNotFoundException("$treeUri/$subdir")
        val files = Arguments.createArray()
        for (child in dir.listFiles()) {
            if (!child.isFile) continue
            files.pushMap(Arguments.createMap().apply {
                putString("name", child.name ?: "")
                putString("uri", child.uri.toString())
                putDouble("bytes", child.length().toDouble())
            })
        }
        files
    }

    /** Writes (or replaces) a small text file, e.g. state/have.json. */
    @ReactMethod
    fun writeFolderText(treeUri: String, subdir: String, name: String, text: String, promise: Promise) = background(promise, "WRITE_FAILED") {
        val dir = folder(treeUri, subdir) ?: throw FileNotFoundException("$treeUri/$subdir")
        val file = dir.findFile(name) ?: dir.createFile("application/octet-stream", name) ?: throw FileNotFoundException(name)
        (context.contentResolver.openOutputStream(file.uri, "wt") ?: throw FileNotFoundException(name)).use { it.write(text.toByteArray(Charsets.UTF_8)) }
        file.uri.toString()
    }

    @ReactMethod
    fun deleteDocument(uri: String, promise: Promise) = background(promise, "DELETE_FAILED") {
        DocumentFile.fromSingleUri(context, Uri.parse(uri))?.delete() ?: false
    }

    /**
     * Writes a stored ZIP into `subdir` of the picked folder: `{ name, path }`
     * entries copy a local file, `{ name, text }` entries write text. Resolves
     * the new file's URI.
     */
    @ReactMethod
    fun exportZip(treeUri: String, subdir: String, fileName: String, entries: ReadableArray, jobId: String, promise: Promise) = background(promise, "EXPORT_FAILED") {
        val dir = folder(treeUri, subdir) ?: throw FileNotFoundException("$treeUri/$subdir")
        dir.findFile(fileName)?.delete()
        val file = dir.createFile("application/zip", fileName) ?: throw FileNotFoundException(fileName)
        var total = 0L
        for (i in 0 until entries.size()) {
            val path = entries.getMap(i)?.getString("path") ?: continue
            total += File(path.removePrefix("file://")).length()
        }
        val progress = Progress(jobId, total)
        val out = context.contentResolver.openOutputStream(file.uri, "w") ?: throw FileNotFoundException(fileName)
        ZipOutputStream(BufferedOutputStream(out, BUFFER)).use { zip ->
            zip.setMethod(ZipOutputStream.STORED)
            for (i in 0 until entries.size()) {
                val item = entries.getMap(i) ?: continue
                val name = item.getString("name") ?: continue
                val path = if (item.hasKey("path")) item.getString("path") else null
                if (path != null) {
                    val source = File(path.removePrefix("file://"))
                    val crc = CRC32()
                    FileInputStream(source).use { input -> pump(input, null) { buffer, n -> crc.update(buffer, 0, n) } }
                    zip.putNextEntry(storedEntry(name, source.length(), crc.value))
                    FileInputStream(source).use { input -> pump(input, zip) { _, n -> progress.add(n.toLong()) } }
                } else {
                    val bytes = (item.getString("text") ?: "").toByteArray(Charsets.UTF_8)
                    val crc = CRC32().apply { update(bytes) }
                    zip.putNextEntry(storedEntry(name, bytes.size.toLong(), crc.value))
                    zip.write(bytes)
                }
                zip.closeEntry()
            }
        }
        progress.finish()
        file.uri.toString()
    }

    /** What device.json says about the phone. */
    @ReactMethod
    fun deviceInfo(promise: Promise) {
        val stat = StatFs(context.filesDir.absolutePath)
        promise.resolve(Arguments.createMap().apply {
            putString("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            putString("androidVersion", Build.VERSION.RELEASE ?: "")
            putDouble("freeBytes", stat.availableBytes.toDouble())
            putString("filesDir", context.filesDir.absolutePath)
        })
    }

    // Required by NativeEventEmitter on the JS side.
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    // ── Activity results ──────────────────────────────────────────────────────

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_PICK_FILES && requestCode != REQUEST_PICK_FOLDER) return
        val promise = pendingPick ?: return
        pendingPick = null
        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.resolve(null)
            return
        }
        if (requestCode == REQUEST_PICK_FILES) {
            val uris = Arguments.createArray()
            val clip = data.clipData
            if (clip != null) {
                for (i in 0 until clip.itemCount) uris.pushString(clip.getItemAt(i).uri.toString())
            } else {
                data.data?.let { uris.pushString(it.toString()) }
            }
            promise.resolve(uris)
            return
        }
        val uri = data.data
        if (uri == null) {
            promise.resolve(null)
            return
        }
        try {
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            promise.resolve(uri.toString())
        } catch (e: SecurityException) {
            promise.reject("FOLDER_PERMISSION", e.message ?: "the folder could not be kept", e)
        }
    }

    override fun onNewIntent(intent: Intent) = Unit

    // ── Internal ──────────────────────────────────────────────────────────────

    private data class JobItem(val entry: String, val dest: String, val sha256: String?, val bytes: Long)

    private inner class Progress(private val jobId: String, private val total: Long) {
        private var bytes = 0L
        private var emitted = 0L
        fun add(n: Long) {
            bytes += n
            if (bytes - emitted >= PROGRESS_STEP) emit()
        }
        fun finish() = emit()
        private fun emit() {
            emitted = bytes
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)?.emit(EVENT_PROGRESS, Arguments.createMap().apply {
                putString("jobId", jobId)
                putDouble("bytes", bytes.toDouble())
                putDouble("total", total.toDouble())
            })
        }
    }

    private fun background(promise: Promise, code: String, block: () -> Any?) {
        io.execute {
            try {
                promise.resolve(block())
            } catch (e: Exception) {
                promise.reject(code, e.message ?: code, e)
            }
        }
    }

    private fun startPicker(promise: Promise, requestCode: Int, intent: Intent) {
        val activity = context.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "the app is not in the foreground")
            return
        }
        if (pendingPick != null) {
            promise.reject("PICKER_BUSY", "a picker is already open")
            return
        }
        pendingPick = promise
        try {
            activity.startActivityForResult(intent, requestCode)
        } catch (e: Exception) {
            pendingPick = null
            promise.reject("PICKER_FAILED", e.message ?: "the picker could not open", e)
        }
    }

    private fun open(uri: String): InputStream =
        if (uri.startsWith("content://")) {
            context.contentResolver.openInputStream(Uri.parse(uri)) ?: throw FileNotFoundException(uri)
        } else {
            FileInputStream(File(uri.removePrefix("file://")))
        }

    /** A path inside the files directory, never outside it. */
    private fun safeRelative(path: String): String {
        require(path.isNotEmpty() && !path.startsWith("/") && path.split('/').none { it == ".." || it.isEmpty() }) { "bad path $path" }
        return path
    }

    private fun stagingDir(): File = File(context.filesDir, STAGING_DIR).apply { mkdirs() }

    private fun folder(treeUri: String, subdir: String): DocumentFile? {
        var dir = DocumentFile.fromTreeUri(context, Uri.parse(treeUri)) ?: return null
        for (part in subdir.split('/').filter { it.isNotEmpty() }) {
            dir = dir.findFile(part)?.takeIf { it.isDirectory } ?: dir.createDirectory(part) ?: return null
        }
        return dir
    }

    private fun readLimited(input: InputStream, maxBytes: Long): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(BUFFER)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
            if (out.size() > maxBytes) throw IllegalStateException("entry is larger than $maxBytes bytes")
        }
        return out.toByteArray()
    }

    private fun pump(input: InputStream, output: OutputStream?, onChunk: (ByteArray, Int) -> Unit) {
        val buffer = ByteArray(BUFFER)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            output?.write(buffer, 0, n)
            onChunk(buffer, n)
        }
    }

    private fun copyHashing(input: InputStream, target: File, progress: Progress): Pair<String, Long> {
        val digest = MessageDigest.getInstance("SHA-256")
        var bytes = 0L
        FileOutputStream(target).use { out ->
            pump(input, out) { buffer, n ->
                digest.update(buffer, 0, n)
                bytes += n
                progress.add(n.toLong())
            }
        }
        return Pair(hex(digest.digest()), bytes)
    }

    private fun writeVerified(input: InputStream, item: JobItem, progress: Progress): com.facebook.react.bridge.WritableMap {
        val dest = File(context.filesDir, item.dest)
        dest.parentFile?.mkdirs()
        val part = File(context.filesDir, "${item.dest}.import")
        return try {
            val (sha, bytes) = copyHashing(input, part, progress)
            val error = when {
                item.sha256 != null && item.sha256 != sha -> "the bytes hash to $sha, not ${item.sha256}"
                item.bytes >= 0 && item.bytes != bytes -> "$bytes bytes, not ${item.bytes}"
                else -> null
            }
            if (error != null) {
                part.delete()
                result(item, false, sha, bytes, error)
            } else {
                moveInto(part, dest)
                result(item, true, sha, bytes, null)
            }
        } catch (e: Exception) {
            part.delete()
            result(item, false, null, 0, e.message ?: "write failed")
        }
    }

    private fun moveInto(from: File, to: File) {
        if (from.renameTo(to)) return
        to.delete()
        if (!from.renameTo(to)) throw IllegalStateException("could not move ${from.name} into place")
    }

    private fun result(item: JobItem, ok: Boolean, sha: String?, bytes: Long, error: String?) = Arguments.createMap().apply {
        putString("entry", item.entry)
        putString("dest", item.dest)
        putBoolean("ok", ok)
        if (sha != null) putString("sha256", sha) else putNull("sha256")
        putDouble("bytes", bytes.toDouble())
        if (error != null) putString("error", error)
    }

    private fun storedEntry(name: String, size: Long, crc: Long) = ZipEntry(name).apply {
        method = ZipEntry.STORED
        this.size = size
        compressedSize = size
        this.crc = crc
        time = 315532800000L // 1980-01-01, like sk-pack's packs
    }

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
}
