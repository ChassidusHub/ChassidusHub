package org.chassidushub.app.background

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS name: `ChassidusHubBackground` (see src/background/backgroundNative.ts).
 * Background-sync scheduling and the app's own notifications - the two
 * things the phone can do that the web app cannot.
 */
class BackgroundModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "ChassidusHubBackground"
    }

    override fun getName(): String = MODULE_NAME

    /** Registers (or cancels) the periodic background sync. Idempotent - safe to call on every launch. */
    @ReactMethod
    fun scheduleSync(enabled: Boolean, intervalHours: Double) {
        if (enabled) {
            BackgroundSyncScheduler.schedule(reactApplicationContext, intervalHours.toLong())
        } else {
            BackgroundSyncScheduler.cancel(reactApplicationContext)
        }
    }

    /** One immediate run of the same sync ("Sync now"). */
    @ReactMethod
    fun runSyncNow() {
        BackgroundSyncScheduler.runNow(reactApplicationContext)
    }

    /**
     * `kind`: "newWeek" or "downloadsReady" - picks the channel and the
     * (stable) notification id, so a repeat replaces the previous one.
     */
    @ReactMethod
    fun postNotification(kind: String, title: String, body: String, deepLink: String?) {
        val (id, channel) = when (kind) {
            "downloadsReady" -> AppNotifications.ID_DOWNLOADS_DONE to AppNotifications.CHANNEL_DOWNLOADS_DONE
            else -> AppNotifications.ID_NEW_WEEK to AppNotifications.CHANNEL_CONTENT
        }
        AppNotifications.post(reactApplicationContext, id, channel, title, body, deepLink)
    }

    /** Whether a notification would actually show: runtime permission (Android 13+) and the app not muted in system settings. */
    @ReactMethod
    fun areNotificationsEnabled(promise: Promise) {
        promise.resolve(AppNotifications.canPost(reactApplicationContext))
    }
}
