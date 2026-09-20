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
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun cancelDownload(context: Context, targetKey: String, filename: String?) {
        cleanupPartFile(context, filename)
        WorkManager.getInstance(context).cancelUniqueWork(targetKey)
    }

    private fun cleanupPartFile(context: Context, filename: String?) {
        if (filename.isNullOrBlank()) return
        File(context.filesDir, "$filename.part").delete()
    }
}
