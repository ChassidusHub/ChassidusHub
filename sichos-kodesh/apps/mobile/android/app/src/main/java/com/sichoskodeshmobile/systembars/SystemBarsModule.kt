package com.sichoskodeshmobile.systembars

import android.os.Build
import android.view.View
import android.view.WindowInsetsController
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Lets JS colour the Android navigation bar (its icons, and the contrast
 * scrim Android paints behind three-button navigation) after the app's *own*
 * theme rather than the system one. React Native's edge-to-edge setup only
 * consults the system dark-mode flag, so an app switched to Dark on a
 * light-themed phone got a light bar under a dark screen (and vice versa).
 *
 * Only the navigation-bar appearance bit is touched, through the platform
 * controller on Android 11+ (the compat wrapper also rewrites the legacy
 * system-UI flags, which briefly disturbed the status bar React Native's own
 * StatusBar module had just styled).
 *
 * JS name: `SichosKodeshSystemBars` (see src/ui/systemBars.ts).
 */
class SystemBarsModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "SichosKodeshSystemBars"
    }

    override fun getName(): String = MODULE_NAME

    /**
     * `style` is the icon colour: "light" (white icons, for a dark app) or
     * "dark" (dark icons, for a light app) - the same vocabulary as
     * StatusBar's `light-content` / `dark-content`.
     */
    @ReactMethod
    @Suppress("DEPRECATION")
    fun setNavigationBarStyle(style: String) {
        val activity = reactApplicationContext.currentActivity ?: return
        val lightBar = style == "dark"
        UiThreadUtil.runOnUiThread {
            val window = activity.window
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.insetsController?.setSystemBarsAppearance(
                    if (lightBar) WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS else 0,
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val decorView = window.decorView
                val flag = View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                decorView.systemUiVisibility =
                    if (lightBar) decorView.systemUiVisibility or flag else decorView.systemUiVisibility and flag.inv()
            }
        }
    }
}
