package org.chassidushub.app.download

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class DownloadCancelReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != DownloadCancellation.ACTION_CANCEL_DOWNLOAD) return
        val targetKey = intent.getStringExtra(DownloadCancellation.EXTRA_TARGET_KEY) ?: return
        val filename = intent.getStringExtra(DownloadCancellation.EXTRA_FILENAME)
        DownloadCancellation.cancelDownload(context, targetKey, filename)
    }
}
