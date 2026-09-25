package com.sichoskodeshmobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.sichoskodeshmobile.appinfo.AppInfoPackage
import com.sichoskodeshmobile.background.BackgroundPackage
import com.sichoskodeshmobile.download.DownloadPackage
import com.sichoskodeshmobile.offline.PackPackage
import com.sichoskodeshmobile.systembars.SystemBarsPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(DownloadPackage())
          add(SystemBarsPackage())
          add(BackgroundPackage())
          add(PackPackage())
          add(AppInfoPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
