package org.chassidushub.app.appinfo

import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * What the in-app update needs to know about this install
 * (src/update/appUpdate.ts): the phone's ABIs, most preferred first, to
 * pick its own APK from the app server; and which store installed the app -
 * one installed from Google Play is updated by Play, never offered an APK.
 *
 * JS name: `ChassidusHubAppInfo`.
 */
class AppInfoModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "ChassidusHubAppInfo"
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun getInfo(promise: Promise) {
        val info = Arguments.createMap()
        val abis = Arguments.createArray()
        Build.SUPPORTED_ABIS.forEach { abis.pushString(it) }
        info.putArray("supportedAbis", abis)
        val installer = try {
            val packageManager = reactApplicationContext.packageManager
            val packageName = reactApplicationContext.packageName
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                packageManager.getInstallSourceInfo(packageName).installingPackageName
            } else {
                @Suppress("DEPRECATION")
                packageManager.getInstallerPackageName(packageName)
            }
        } catch (_: Exception) {
            null
        }
        if (installer != null) info.putString("installer", installer) else info.putNull("installer")
        promise.resolve(info)
    }
}
