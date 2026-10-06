package org.chassidushub.app.background

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * Runs the app's background sync with no UI: the JS headless task
 * `ChassidusHubBackgroundSync` (see src/background/backgroundSyncTask.ts)
 * decides what this week needs - which kvius year, which occasions, which
 * files per the download settings - and hands each missing file to
 * DownloadWorker. The kvius engine and the catalog live in JS, so the JS
 * runtime is started here in-process when the app isn't running (what
 * React Native's HeadlessJsTaskService does, minus the foreground service
 * that Android 12+ no longer lets a background job start).
 *
 * Scheduled periodically by BackgroundSyncScheduler; also run once from
 * "Download this week now" in the download settings.
 */
class BackgroundSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    companion object {
        const val TASK_KEY = "ChassidusHubBackgroundSync"
        const val KEY_REASON = "reason"

        /** The JS task only resolves targets and enqueues downloads - seconds, not minutes. */
        private const val TASK_TIMEOUT_MS = 5 * 60_000L
        private const val REACT_START_TIMEOUT_MS = 90_000L
        private const val POLL_MS = 500L
    }

    override suspend fun doWork(): Result {
        val reactHost = (applicationContext as? ReactApplication)?.reactHost ?: return Result.failure()

        val reactContext = try {
            withTimeout(REACT_START_TIMEOUT_MS) { awaitReactContext(reactHost) }
        } catch (_: Exception) {
            return if (runAttemptCount < 3) Result.retry() else Result.failure()
        }

        val taskContext = HeadlessJsTaskContext.getInstance(reactContext)
        val data = Arguments.createMap().apply {
            putString(KEY_REASON, inputData.getString(KEY_REASON) ?: "periodic")
        }
        val config = HeadlessJsTaskConfig(TASK_KEY, data, TASK_TIMEOUT_MS, true)
        val taskId = withContext(Dispatchers.Main) { taskContext.startTask(config) }
        withTimeoutOrNull(TASK_TIMEOUT_MS) {
            while (taskContext.isTaskRunning(taskId)) delay(POLL_MS)
        }
        return Result.success()
    }

    private suspend fun awaitReactContext(reactHost: ReactHost): ReactContext {
        reactHost.currentReactContext?.let { return it }
        return suspendCancellableCoroutine { continuation ->
            val listener = object : ReactInstanceEventListener {
                override fun onReactContextInitialized(context: ReactContext) {
                    reactHost.removeReactInstanceEventListener(this)
                    if (continuation.isActive) continuation.resume(context)
                }
            }
            reactHost.addReactInstanceEventListener(listener)
            // Initialised between the check above and the listener registration?
            reactHost.currentReactContext?.let { context ->
                reactHost.removeReactInstanceEventListener(listener)
                if (continuation.isActive) continuation.resume(context)
                return@suspendCancellableCoroutine
            }
            continuation.invokeOnCancellation { reactHost.removeReactInstanceEventListener(listener) }
            Handler(Looper.getMainLooper()).post { reactHost.start() }
        }
    }
}
