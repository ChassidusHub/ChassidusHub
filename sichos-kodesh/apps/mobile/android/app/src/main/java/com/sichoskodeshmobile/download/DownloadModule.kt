package com.sichoskodeshmobile.download

import androidx.lifecycle.LiveData
import androidx.lifecycle.Observer
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * React Native native module exposing Android WorkManager-backed downloads to JS.
 *
 * JS name: `SichosKodeshDownloader`
 *
 * Events emitted on the RCTDeviceEventEmitter bus:
 *   - `SichosKodeshDownloadProgress` → { targetKey, bytesReceived, bytesTotal }
 *   - `SichosKodeshDownloadComplete` → { targetKey, localPath }
 *   - `SichosKodeshDownloadError`    → { targetKey, error }
 */
class DownloadModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "SichosKodeshDownloader"

        const val EVENT_PROGRESS = "SichosKodeshDownloadProgress"
        const val EVENT_COMPLETE = "SichosKodeshDownloadComplete"
        const val EVENT_ERROR = "SichosKodeshDownloadError"

        private const val WORK_TAG = "SichosKodeshDownload"
    }

    /** Pairs of (LiveData, Observer) for every in-flight download, keyed by targetKey.
     *  Cleaned up on terminal state and also on bridge teardown to prevent leaks. */
    private val activeObservers = mutableMapOf<String, Pair<LiveData<WorkInfo>, Observer<WorkInfo>>>()

    override fun getName(): String = MODULE_NAME

    /**
     * Enqueue a download via WorkManager.
     *
     * @param targetKey  Stable unique key identifying the download target (matches JS ledger key).
     * @param url        Remote URL to download from (should use media-proxy URL, not raw CDN).
     * @param filename   Destination filename (written inside app filesDir).
     * @param _metadata  Reserved for future use (priority, content-type, etc).
     * @param promise    Resolved with `{ targetKey, workId }` once the work is enqueued.
     */
    @ReactMethod
    fun enqueueDownload(targetKey: String, url: String, filename: String, @Suppress("UNUSED_PARAMETER") _metadata: ReadableMap?, promise: Promise) {
        try {
            val workManager = WorkManager.getInstance(reactApplicationContext)
            val inputData = Data.Builder()
                .putString(DownloadWorker.KEY_TARGET_KEY, targetKey)
                .putString(DownloadWorker.KEY_URL, url)
                .putString(DownloadWorker.KEY_FILENAME, filename)
                .build()

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(inputData)
                .setConstraints(constraints)
                .addTag(WORK_TAG)
                .addTag(targetKey)
                .build()

            workManager.enqueueUniqueWork(targetKey, ExistingWorkPolicy.KEEP, request)

            observeWork(targetKey, request.id.toString())

            val result = Arguments.createMap().apply {
                putString("targetKey", targetKey)
                putString("workId", request.id.toString())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ENQUEUE_FAILED", e.message ?: "enqueue failed", e)
        }
    }

    /**
     * Cancel any enqueued or running download for the given targetKey.
     */
    @ReactMethod
    fun cancelDownload(targetKey: String, promise: Promise) {
        try {
            WorkManager.getInstance(reactApplicationContext).cancelUniqueWork(targetKey)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CANCEL_FAILED", e.message ?: "cancel failed", e)
        }
    }

    /**
     * Returns the app-private files directory path so JS can construct absolute paths.
     */
    @ReactMethod
    fun getFilesDir(promise: Promise) {
        promise.resolve(reactApplicationContext.filesDir.absolutePath)
    }

    /** Remove all registered observers on bridge teardown to prevent leaks during hot-reload or re-init. */
    override fun invalidate() {
        super.invalidate()
        reactApplicationContext.runOnUiQueueThread {
            for ((liveData, observer) in activeObservers.values) {
                liveData.removeObserver(observer)
            }
            activeObservers.clear()
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun observeWork(targetKey: String, workId: String) {
        val workManager = WorkManager.getInstance(reactApplicationContext)
        reactApplicationContext.runOnUiQueueThread {
            val liveData = workManager.getWorkInfoByIdLiveData(java.util.UUID.fromString(workId))
            val observer = object : Observer<WorkInfo> {
                override fun onChanged(info: WorkInfo) {
                    when (info.state) {
                        WorkInfo.State.RUNNING -> {
                            val received = info.progress.getLong(DownloadWorker.PROGRESS_BYTES_RECEIVED, 0)
                            val total = info.progress.getLong(DownloadWorker.PROGRESS_BYTES_TOTAL, 0)
                            emitEvent(EVENT_PROGRESS, Arguments.createMap().apply {
                                putString("targetKey", targetKey)
                                putDouble("bytesReceived", received.toDouble())
                                putDouble("bytesTotal", total.toDouble())
                            })
                        }
                        WorkInfo.State.SUCCEEDED -> {
                            val localPath = info.outputData.getString(DownloadWorker.OUT_LOCAL_PATH) ?: ""
                            emitEvent(EVENT_COMPLETE, Arguments.createMap().apply {
                                putString("targetKey", targetKey)
                                putString("localPath", localPath)
                            })
                            removeObserver(targetKey, liveData, this)
                        }
                        WorkInfo.State.FAILED, WorkInfo.State.CANCELLED -> {
                            val error = info.outputData.getString(DownloadWorker.OUT_ERROR) ?: "download failed"
                            emitEvent(EVENT_ERROR, Arguments.createMap().apply {
                                putString("targetKey", targetKey)
                                putString("error", error)
                            })
                            removeObserver(targetKey, liveData, this)
                        }
                        else -> Unit
                    }
                }
            }
            activeObservers[targetKey] = Pair(liveData, observer)
            liveData.observeForever(observer)
        }
    }

    private fun removeObserver(targetKey: String, liveData: LiveData<WorkInfo>, observer: Observer<WorkInfo>) {
        liveData.removeObserver(observer)
        activeObservers.remove(targetKey)
    }

    private fun emitEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(eventName, params)
    }
}
