package com.sichoskodeshmobile.download

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.work.WorkInfo
import androidx.work.WorkManager
import java.io.File

internal object DownloadCancellation {
    const val ACTION_CANCEL_DOWNLOAD = "com.sichoskodeshmobile.download.CANCEL_DOWNLOAD"
    const val EXTRA_TARGET_KEY = "targetKey"

    fun createCancelPendingIntent(context: Context, targetKey: String): PendingIntent {
        val intent = Intent(context, DownloadCancelReceiver::class.java).apply {
            action = ACTION_CANCEL_DOWNLOAD
            putExtra(EXTRA_TARGET_KEY, targetKey)
        }
        return PendingIntent.getBroadcast(
            context,
            targetKey.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun cancelDownload(context: Context, targetKey: String) {
        cleanupPartFile(context, targetKey)
        WorkManager.getInstance(context).cancelUniqueWork(targetKey)
    }

    private fun cleanupPartFile(context: Context, targetKey: String) {
        val filename = try {
            WorkManager.getInstance(context)
                .getWorkInfosForUniqueWork(targetKey)
                .get()
                .firstNotNullOfOrNull { info ->
                    if (info.state == WorkInfo.State.SUCCEEDED) {
                        null
                    } else {
                        info.inputData.getString(DownloadWorker.KEY_FILENAME)
                    }
                }
        } catch (_: Exception) {
            null
        } ?: return

        File(context.filesDir, "$filename.part").delete()
    }
}
