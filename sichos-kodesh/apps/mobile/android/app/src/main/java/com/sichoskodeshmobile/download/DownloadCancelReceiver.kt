package com.sichoskodeshmobile.download

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class DownloadCancelReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != DownloadCancellation.ACTION_CANCEL_DOWNLOAD) return
        val targetKey = intent.getStringExtra(DownloadCancellation.EXTRA_TARGET_KEY) ?: return
        DownloadCancellation.cancelDownload(context, targetKey)
    }
}
