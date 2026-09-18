/**
 * Sichos Kodesh mobile app shell.
 * Uses React Navigation (native stack) instead of a local view-switch.
 *
 * @format
 */

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DownloadProvider } from './src/download/DownloadProvider';
import { LanguageProvider } from './src/i18n/LanguageProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <LanguageProvider>
        <DownloadProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </DownloadProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

export default App;
