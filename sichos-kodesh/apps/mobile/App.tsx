/**
 * Sichos Kodesh - thin MVP: pick a kvius-matched year, see this week's
 * matched occasion, download it, play/read fully offline.
 *
 * @format
 */

import React, { useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { currentHebrewYear } from './src/engine/currentHebrewYear';
import { YearPickerScreen } from './src/screens/YearPickerScreen';
import { ThisWeekScreen } from './src/screens/ThisWeekScreen';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const targetYear = currentHebrewYear();
  const [sourceYear, setSourceYear] = useState<number | null>(null);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {sourceYear === null ? (
        <YearPickerScreen targetYear={targetYear} onSelectYear={setSourceYear} />
      ) : (
        <ThisWeekScreen targetYear={targetYear} sourceYear={sourceYear} onBack={() => setSourceYear(null)} />
      )}
    </SafeAreaProvider>
  );
}

export default App;
