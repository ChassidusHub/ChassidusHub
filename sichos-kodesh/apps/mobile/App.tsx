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
import type { LinkingOptions } from '@react-navigation/native';
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBackgroundSyncScheduling } from './src/background/useBackgroundSyncScheduling';
import { NotificationInvite } from './src/background/NotificationInvite';
import { UpdateInvite } from './src/update/UpdateInvite';
import { useAppUpdatePrompt } from './src/update/appUpdate';
import { useNotificationInvite } from './src/background/useNotificationPermission';
import { useAutoCatalogUpdate } from './src/catalog/catalogUpdater';
import { DownloadProvider } from './src/download/DownloadProvider';
import { useAutoDownloadSync } from './src/download/useAutoDownloadSync';
import { useDownloadRetention } from './src/download/useDownloadRetention';
import { useOfflineAutoImport } from './src/offline/useOfflineAutoImport';
import { LanguageProvider } from './src/i18n/LanguageProvider';
import { PlayerProvider } from './src/player/PlayerProvider';
import { hydrateProgressStore } from './src/player/progressStore';
import { onNavigationStateChange, useConnectivityRecheckTriggers } from './src/network/useConnectivityRecheckTriggers';
import { ConnectivityBanner, useConnectivityBannerVisible } from './src/components/ConnectivityBanner';
import { DownloadProgressBar } from './src/components/DownloadProgressBar';
import { ModeChooser } from './src/components/ModeChooser';
import { loadAppMode, useAppMode } from './src/appMode/appMode';
import { OfflineActivityBar } from './src/components/OfflineActivityBar';
import { GlobalPlayerBar } from './src/components/GlobalPlayerBar';
import { navigationRef, publishNavigationState, useStackNames } from './src/navigation/navigationRef';
import { showsTabs } from './src/navigation/tabs';
import { AppNav } from './src/components/AppNav';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/navigation/types';

/**
 * Where the app's own notifications land when tapped (see
 * src/background/backgroundNative.ts for the links and the manifest for
 * the `sichoskodesh` scheme). Home stays underneath, so Back still works.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['sichoskodesh://'],
  config: {
    initialRouteName: 'Home',
    screens: {
      Home: '',
      ThisWeek: { path: 'this-week/:sourceYear', parse: { sourceYear: Number } },
      Downloaded: 'downloaded',
      Settings: 'settings',
      DownloadSettings: 'settings/downloads',
      Offline: 'settings/offline',
    },
  },
};
import { applyNavigationBarScheme } from './src/ui/systemBars';
import { ThemeProvider, useTheme } from './src/ui/theme';

function AppShell() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const bannerVisible = useConnectivityBannerVisible();
  const stack = useStackNames();
  // Under the tabs the safe-area strip takes the tab bar's surface, so the bar reaches the screen's edge.
  const tabsShown = stack.length > 0 && showsTabs(stack[stack.length - 1]);
  useAutoCatalogUpdate();
  useAutoDownloadSync();
  useDownloadRetention();
  useOfflineAutoImport();
  useConnectivityRecheckTriggers();
  useBackgroundSyncScheduling();

  useEffect(() => {
    hydrateProgressStore().catch(() => undefined);
  }, []);

  const mode = useAppMode();
  useEffect(() => {
    loadAppMode().catch(() => undefined);
  }, []);
  // Notifications are offered only once setup is done, in the app's own words before the phone's question.
  const invite = useNotificationInvite(mode === 'online' || mode === 'offline');
  // A newer version on the app server: asked once a launch, never over the mode chooser or the notification invite.
  const appUpdate = useAppUpdatePrompt((mode === 'online' || mode === 'offline') && !invite.visible);

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

  // Until the stored mode is read, a blank page (no flash of the chooser); a phone that never chose sees the chooser first.
  if (mode === undefined) return <View style={[styles.root, { backgroundColor: colors.bg }]} />;
  if (mode === null) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
        <ModeChooser />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ConnectivityBanner visible={bannerVisible} topInset={insets.top} />
      <SafeAreaInsetsContext.Provider value={screenInsets}>
        <View style={styles.content}>
          <NavigationContainer
            ref={navigationRef}
            theme={navigationTheme}
            linking={linking}
            onReady={publishNavigationState}
            onStateChange={() => {
              onNavigationStateChange();
              publishNavigationState();
            }}
          >
            <RootNavigator />
          </NavigationContainer>
        </View>
      </SafeAreaInsetsContext.Provider>
      {/* One bottom container - OfflineActivityBar, DownloadProgressBar and GlobalPlayerBar each hide themselves independently and stack here, above the tabs. The safe-area inset lives here once, under the tabs. */}
      <View style={{ paddingBottom: insets.bottom, backgroundColor: tabsShown ? colors.bgElevated : undefined }}>
        <OfflineActivityBar />
        <DownloadProgressBar />
        <GlobalPlayerBar />
        <AppNav />
      </View>
      <NotificationInvite visible={invite.visible} online={mode === 'online'} onAllow={invite.allow} onLater={invite.later} />
      <UpdateInvite visible={appUpdate.visible && !invite.visible} release={appUpdate.release} file={appUpdate.file} onUpdate={appUpdate.update} onLater={appUpdate.later} />
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
