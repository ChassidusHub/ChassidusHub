package org.chassidushub.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import org.chassidushub.app.appinfo.AppInfoPackage
import org.chassidushub.app.background.BackgroundPackage
import org.chassidushub.app.download.DownloadPackage
import org.chassidushub.app.offline.PackPackage
import org.chassidushub.app.systembars.SystemBarsPackage

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
