package com.sichoskodeshmobile.systembars

import androidx.core.view.WindowInsetsControllerCompat
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
    fun setNavigationBarStyle(style: String) {
        val activity = reactApplicationContext.currentActivity ?: return
        UiThreadUtil.runOnUiThread {
            val window = activity.window
            WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightNavigationBars =
                style == "dark"
        }
    }
}
