/**
 * Sichos Kodesh - thin MVP: pick a kvius-matched year, see this week's
 * matched occasion, download it, play/read fully offline. Also supports
 * browsing any indexed year directly, without a kvius match.
 *
 * @format
 */

import React, { useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import { YearPickerScreen } from './src/screens/YearPickerScreen';
import { ThisWeekScreen } from './src/screens/ThisWeekScreen';
import { YearBrowserScreen } from './src/screens/YearBrowserScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

type View =
  | { kind: 'pick' }
  | { kind: 'thisWeek'; sourceYear: number }
  | { kind: 'browseYear'; hebrewYear: number }
  | { kind: 'settings' };

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const targetYear = currentHebrewYear();
  const [view, setView] = useState<View>({ kind: 'pick' });

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {view.kind === 'thisWeek' && (
        <ThisWeekScreen sourceYear={view.sourceYear} onBack={() => setView({ kind: 'pick' })} />
      )}
      {view.kind === 'browseYear' && (
        <YearBrowserScreen hebrewYear={view.hebrewYear} onBack={() => setView({ kind: 'pick' })} />
      )}
      {view.kind === 'settings' && <SettingsScreen onBack={() => setView({ kind: 'pick' })} />}
      {view.kind === 'pick' && (
        <YearPickerScreen
          targetYear={targetYear}
          onSelectKviusYear={(sourceYear) => setView({ kind: 'thisWeek', sourceYear })}
          onSelectBrowseYear={(hebrewYear) => setView({ kind: 'browseYear', hebrewYear })}
          onOpenSettings={() => setView({ kind: 'settings' })}
        />
      )}
    </SafeAreaProvider>
  );
}

export default App;
