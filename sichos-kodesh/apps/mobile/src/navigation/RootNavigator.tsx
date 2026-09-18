import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { YearPickerScreen } from '../screens/YearPickerScreen';
import { KviusYearsScreen } from '../screens/KviusYearsScreen';
import { BrowseYearsScreen } from '../screens/BrowseYearsScreen';
import { ThisWeekScreen } from '../screens/ThisWeekScreen';
import { YearBrowserScreen } from '../screens/YearBrowserScreen';
import { PdfViewerScreen } from '../screens/PdfViewerScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Home" component={YearPickerScreen} />
      <Stack.Screen name="KviusYears" component={KviusYearsScreen} />
      <Stack.Screen name="BrowseYears" component={BrowseYearsScreen} />
      <Stack.Screen name="ThisWeek" component={ThisWeekScreen} />
      <Stack.Screen name="YearBrowser" component={YearBrowserScreen} />
      <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      {/* Placeholder screens for routes not yet fully implemented (Phase 1B+) */}
      <Stack.Screen name="MonthOccasions" component={PlaceholderScreen} />
      <Stack.Screen name="FollowMonthList" component={PlaceholderScreen} />
      <Stack.Screen name="FollowMonthOccasions" component={PlaceholderScreen} />
      <Stack.Screen name="Farbrengen" component={PlaceholderScreen} />
      <Stack.Screen name="Recordings" component={PlaceholderScreen} />
      <Stack.Screen name="Category" component={PlaceholderScreen} />
      <Stack.Screen name="Search" component={PlaceholderScreen} />
      <Stack.Screen name="Downloaded" component={PlaceholderScreen} />
      <Stack.Screen name="DownloadSettings" component={PlaceholderScreen} />
      <Stack.Screen name="About" component={PlaceholderScreen} />
      <Stack.Screen name="AllYearsThisWeek" component={PlaceholderScreen} />
      <Stack.Screen name="OccasionAllYears" component={PlaceholderScreen} />
    </Stack.Navigator>
  );
}
