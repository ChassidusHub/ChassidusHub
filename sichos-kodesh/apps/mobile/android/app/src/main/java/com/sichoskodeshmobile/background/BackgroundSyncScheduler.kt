package com.sichoskodeshmobile.background

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
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
 *
 * Re-registering on every launch is a no-op when the job already exists
 * (KEEP, not UPDATE - an update reschedules the job, which on a busy start
 * meant JobScheduler stopping a run that had just begun). The first run
 * waits a while too: the in-app sync-on-open already covers the moment the
 * app starts, and the JS runtime is busiest right then.
 */
object BackgroundSyncScheduler {
    private const val PERIODIC_WORK_NAME = "sichos-kodesh-background-sync"
    private const val NOW_WORK_NAME = "sichos-kodesh-background-sync-now"
    private const val FIRST_RUN_DELAY_MINUTES = 15L

    fun schedule(context: Context, intervalHours: Long) {
        val request = PeriodicWorkRequestBuilder<BackgroundSyncWorker>(intervalHours.coerceAtLeast(1), TimeUnit.HOURS)
            .setInputData(workDataOf(BackgroundSyncWorker.KEY_REASON to "periodic"))
            // Starting the JS runtime in the background is real work; a nearly
            // flat battery can wait for the next period (the in-app sync on
            // open still runs regardless).
            .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
            .setInitialDelay(FIRST_RUN_DELAY_MINUTES, TimeUnit.MINUTES)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
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
