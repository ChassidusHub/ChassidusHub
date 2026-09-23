import { NativeModules, Platform } from 'react-native';

interface SystemBarsModule {
  setNavigationBarStyle(style: 'light' | 'dark'): void;
}

/**
 * Colours the Android navigation bar after the app's resolved theme, the way
 * `StatusBar barStyle` already does for the status bar. React Native itself
 * only styles that bar from the *system* theme, so an app set to Dark on a
 * light phone kept a light bar under a dark screen. Backed by
 * android/.../systembars/SystemBarsModule.kt; a no-op elsewhere.
 */
export function applyNavigationBarScheme(scheme: 'light' | 'dark'): void {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.SichosKodeshSystemBars as SystemBarsModule | undefined;
  mod?.setNavigationBarStyle(scheme === 'dark' ? 'light' : 'dark');
}
