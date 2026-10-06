package org.chassidushub.app.download

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * The phone's own network state, for JS: whether there is a network at all,
 * whether Android has seen it reach the internet, and whether it is Wi-Fi
 * (unmetered) - what a Wi-Fi-only download waits for.
 *
 * JS name: `ChassidusHubNetwork`. Emits `ChassidusHubNetworkChanged` with the
 * same map as `getState` whenever the default network comes, goes or changes.
 *
 * Without it the app only learned it was offline when a fetch failed - and
 * a WorkManager download waiting for its network never fails, so a phone
 * with no Wi-Fi showed its queue as downloading forever.
 */
class NetworkModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "ChassidusHubNetwork"
        const val EVENT_CHANGED = "ChassidusHubNetworkChanged"
    }

    private val connectivity: ConnectivityManager? =
        reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private var callback: ConnectivityManager.NetworkCallback? = null

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun getState(promise: Promise) {
        promise.resolve(currentState())
    }

    /** Start sending `ChassidusHubNetworkChanged`; called once by JS. */
    @ReactMethod
    fun startWatching() {
        val manager = connectivity ?: return
        if (callback != null) return
        val next = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = emitState()
            override fun onLost(network: Network) = emitState()
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = emitState()
        }
        try {
            manager.registerDefaultNetworkCallback(next)
            callback = next
        } catch (_: Exception) {
            // Too many callbacks registered, or no permission: JS keeps the state it read last.
        }
    }

    // Required by NativeEventEmitter.
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    override fun invalidate() {
        super.invalidate()
        val manager = connectivity
        val registered = callback
        if (manager != null && registered != null) {
            try {
                manager.unregisterNetworkCallback(registered)
            } catch (_: Exception) {
            }
        }
        callback = null
    }

    private fun currentState(): WritableMap {
        val manager = connectivity
        val capabilities = manager?.activeNetwork?.let { manager.getNetworkCapabilities(it) }
        val connected = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        return Arguments.createMap().apply {
            putBoolean("connected", connected)
            putBoolean("validated", connected && capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
            putBoolean("unmetered", connected && capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true)
        }
    }

    private fun emitState() {
        if (!reactApplicationContext.hasActiveReactInstance()) return
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(EVENT_CHANGED, currentState())
    }
}
