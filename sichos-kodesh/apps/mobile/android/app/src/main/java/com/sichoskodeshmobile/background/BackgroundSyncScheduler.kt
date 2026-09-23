package com.sichoskodeshmobile.background

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/**
 * Keeps one periodic BackgroundSyncWorker registered (or none). No network
 * constraint on purpose: the sync also decides whether to post the "new
 * week" notice, which needs no network, and every file it queues carries
 * its own network (and Wi-Fi-only) constraint in DownloadWorker.
 */
object BackgroundSyncScheduler {
    private const val PERIODIC_WORK_NAME = "sichos-kodesh-background-sync"
    private const val NOW_WORK_NAME = "sichos-kodesh-background-sync-now"

    fun schedule(context: Context, intervalHours: Long) {
        val request = PeriodicWorkRequestBuilder<BackgroundSyncWorker>(intervalHours.coerceAtLeast(1), TimeUnit.HOURS)
            .setInputData(workDataOf(BackgroundSyncWorker.KEY_REASON to "periodic"))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME)
    }

    fun runNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<BackgroundSyncWorker>()
            .setInputData(workDataOf(BackgroundSyncWorker.KEY_REASON to "manual"))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW_WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }
}
