package com.sichoskodeshmobile.download

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.work.WorkManager
import java.io.File

internal object DownloadCancellation {
    const val ACTION_CANCEL_DOWNLOAD = "com.sichoskodeshmobile.download.CANCEL_DOWNLOAD"
    const val EXTRA_TARGET_KEY = "targetKey"
    const val EXTRA_FILENAME = "filename"
    private const val REQUEST_CODE_PREFS = "download_cancel_request_codes"
    private const val NEXT_REQUEST_CODE_KEY = "next_request_code"
    private const val REQUEST_CODE_PREFIX = "request_code:"

    fun createCancelPendingIntent(context: Context, targetKey: String, filename: String): PendingIntent {
        val intent = Intent(context, DownloadCancelReceiver::class.java).apply {
            action = ACTION_CANCEL_DOWNLOAD
            data = Uri.Builder()
                .scheme("sichos-kodesh")
                .authority("download-cancel")
                .appendPath(targetKey)
                .build()
            putExtra(EXTRA_TARGET_KEY, targetKey)
            putExtra(EXTRA_FILENAME, filename)
        }
        return PendingIntent.getBroadcast(
            context,
            requestCodeFor(context, targetKey),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun cancelDownload(context: Context, targetKey: String, filename: String?) {
        cleanupPartFile(context, filename)
        WorkManager.getInstance(context).cancelUniqueWork(targetKey)
        clearRequestCode(context, targetKey)
    }

    private fun cleanupPartFile(context: Context, filename: String?) {
        if (filename.isNullOrBlank()) return
        File(context.filesDir, "$filename.part").delete()
    }

    private fun requestCodeFor(context: Context, targetKey: String): Int {
        synchronized(this) {
            val prefs = context.getSharedPreferences(REQUEST_CODE_PREFS, Context.MODE_PRIVATE)
            val requestCodeKey = "$REQUEST_CODE_PREFIX$targetKey"
            val existing = prefs.getInt(requestCodeKey, -1)
            if (existing != -1) return existing

            val next = prefs.getInt(NEXT_REQUEST_CODE_KEY, 1)
            prefs.edit()
                .putInt(requestCodeKey, next)
                .putInt(NEXT_REQUEST_CODE_KEY, if (next == Int.MAX_VALUE) 1 else next + 1)
                .apply()
            return next
        }
    }

    private fun clearRequestCode(context: Context, targetKey: String) {
        context.getSharedPreferences(REQUEST_CODE_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove("$REQUEST_CODE_PREFIX$targetKey")
            .apply()
    }
}
