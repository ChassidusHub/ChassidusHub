/**
 * Sichos Kodesh mobile app shell - the same provider stack, bottom bars and
 * top connectivity strip as apps/web/src/App.tsx, on React Navigation's
 * native stack instead of React Router.
 *
 * @format
 */

import React, { useEffect, useMemo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DownloadProvider } from './src/download/DownloadProvider';
import { useAutoDownloadSync } from './src/download/useAutoDownloadSync';
import { useDownloadRetention } from './src/download/useDownloadRetention';
import { LanguageProvider } from './src/i18n/LanguageProvider';
import { PlayerProvider } from './src/player/PlayerProvider';
import { hydrateProgressStore } from './src/player/progressStore';
import { onNavigationStateChange, useConnectivityRecheckTriggers } from './src/network/useConnectivityRecheckTriggers';
import { ConnectivityBanner, useConnectivityBannerVisible } from './src/components/ConnectivityBanner';
import { DownloadProgressBar } from './src/components/DownloadProgressBar';
import { GlobalPlayerBar } from './src/components/GlobalPlayerBar';
import { navigationRef } from './src/navigation/navigationRef';
import { RootNavigator } from './src/navigation/RootNavigator';
import { applyNavigationBarScheme } from './src/ui/systemBars';
import { ThemeProvider, useTheme } from './src/ui/theme';

function AppShell() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const bannerVisible = useConnectivityBannerVisible();
  useAutoDownloadSync();
  useDownloadRetention();
  useConnectivityRecheckTriggers();

  useEffect(() => {
    hydrateProgressStore().catch(() => undefined);
  }, []);

  // The status bar follows the theme via <StatusBar barStyle> below; the
  // Android navigation bar needs the same treatment by hand.
  useEffect(() => {
    applyNavigationBarScheme(scheme);
  }, [scheme]);

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: colors.bg, card: colors.bgElevated, text: colors.fg, border: colors.border, primary: colors.accent } };
  }, [colors, scheme]);

  // While the connectivity strip is showing it absorbs the status-bar inset
  // itself (like the web's `padding-top: calc(10px + env(safe-area-inset-top))`),
  // so the screen below it must not pad for the status bar a second time.
  const screenInsets = useMemo(() => (bannerVisible ? { ...insets, top: 0 } : insets), [bannerVisible, insets]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ConnectivityBanner visible={bannerVisible} topInset={insets.top} />
      <SafeAreaInsetsContext.Provider value={screenInsets}>
        <View style={styles.content}>
          <NavigationContainer ref={navigationRef} theme={navigationTheme} onStateChange={onNavigationStateChange}>
            <RootNavigator />
          </NavigationContainer>
        </View>
      </SafeAreaInsetsContext.Provider>
      {/* One bottom container, not two - DownloadProgressBar and GlobalPlayerBar each hide themselves independently and stack here. The safe-area inset lives here once. */}
      <View style={{ paddingBottom: insets.bottom }}>
        <DownloadProgressBar />
        <GlobalPlayerBar />
      </View>
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <DownloadProvider>
            <PlayerProvider>
              <AppShell />
            </PlayerProvider>
          </DownloadProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});

export default App;
