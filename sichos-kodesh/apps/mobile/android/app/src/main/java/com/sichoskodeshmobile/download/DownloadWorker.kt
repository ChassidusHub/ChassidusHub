package com.sichoskodeshmobile.download

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * WorkManager worker that performs a single file download in the background.
 *
 * Download flow:
 * 1. Open HTTP(S) connection; resume via Range header if a `.part` file already exists.
 * 2. Stream bytes into `<filename>.part` inside the app's files directory.
 * 3. Atomically rename `.part` → final filename once complete.
 * 4. Emit progress via setProgress so the JS side can observe updates.
 */
class DownloadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    companion object {
        const val KEY_TARGET_KEY = "targetKey"
        const val KEY_URL = "url"
        const val KEY_FILENAME = "filename"

        const val OUT_LOCAL_PATH = "localPath"
        const val OUT_ERROR = "error"

        const val PROGRESS_BYTES_RECEIVED = "bytesReceived"
        const val PROGRESS_BYTES_TOTAL = "bytesTotal"

        private const val NOTIFICATION_CHANNEL_ID = "sichos_kodesh_downloads"
        private const val NOTIFICATION_ID = 1002

        private const val BUFFER_SIZE = 8 * 1024
        private const val PROGRESS_INTERVAL_BYTES = 64 * 1024L
    }

    override suspend fun doWork(): Result {
        val targetKey = inputData.getString(KEY_TARGET_KEY) ?: return Result.failure(workDataOf(OUT_ERROR to "missing targetKey"))
        val url = inputData.getString(KEY_URL) ?: return Result.failure(workDataOf(OUT_ERROR to "missing url"))
        val filename = inputData.getString(KEY_FILENAME) ?: return Result.failure(workDataOf(OUT_ERROR to "missing filename"))

        setForeground(createForegroundInfo())

        val filesDir = applicationContext.filesDir
        val destFile = File(filesDir, filename)
        val partFile = File(filesDir, "$filename.part")

        return try {
            downloadFile(url, destFile, partFile)
            Result.success(workDataOf(OUT_LOCAL_PATH to destFile.absolutePath))
        } catch (e: Exception) {
            // Do NOT delete partFile here — it may contain partially downloaded bytes
            // that the next WorkManager retry can resume from via the HTTP Range header.
            // Only non-recoverable cases (e.g. 4xx responses handled inside downloadFile)
            // should clean up the part file explicitly.
            Result.failure(workDataOf(OUT_ERROR to (e.message ?: "unknown error"), KEY_TARGET_KEY to targetKey))
        }
    }

    private suspend fun downloadFile(url: String, destFile: File, partFile: File) {
        val existingBytes = if (partFile.exists()) partFile.length() else 0L

        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 30_000
        connection.readTimeout = 60_000
        if (existingBytes > 0) {
            connection.setRequestProperty("Range", "bytes=$existingBytes-")
        }
        connection.connect()

        try {
        val responseCode = connection.responseCode
        val append = responseCode == HttpURLConnection.HTTP_PARTIAL && existingBytes > 0
        val contentLength = connection.contentLengthLong
        val totalBytes = if (append) existingBytes + contentLength else contentLength

        val input = connection.inputStream
        val output = FileOutputStream(partFile, append)
        val buffer = ByteArray(BUFFER_SIZE)
        var receivedSinceLastReport = 0L
        var totalReceived = if (append) existingBytes else 0L

        try {
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                output.write(buffer, 0, bytesRead)
                totalReceived += bytesRead
                receivedSinceLastReport += bytesRead
                if (receivedSinceLastReport >= PROGRESS_INTERVAL_BYTES) {
                    receivedSinceLastReport = 0
                    setProgress(
                        workDataOf(
                            PROGRESS_BYTES_RECEIVED to totalReceived,
                            PROGRESS_BYTES_TOTAL to totalBytes,
                        )
                    )
                }
            }
        } finally {
            output.flush()
            output.close()
            input.close()
        }

        if (!partFile.renameTo(destFile)) {
            destFile.delete()
            if (!partFile.renameTo(destFile)) {
                throw RuntimeException("Failed to move part file to destination: ${destFile.absolutePath}")
            }
        }

        setProgress(
            workDataOf(
                PROGRESS_BYTES_RECEIVED to totalReceived,
                PROGRESS_BYTES_TOTAL to totalBytes,
            )
        )
        } finally {
            connection.disconnect()
        }
    }

    private fun createForegroundInfo(): ForegroundInfo {
        createNotificationChannel()
        val notification = NotificationCompat.Builder(applicationContext, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Downloading…")
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setSilent(true)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    "Downloads",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply { description = "Background download progress" }
                manager.createNotificationChannel(channel)
            }
        }
    }
}
