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
import { AboutScreen } from '../screens/AboutScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { DownloadedScreen } from '../screens/DownloadedScreen';
import { DownloadSettingsScreen } from '../screens/DownloadSettingsScreen';
import { MonthOccasionsScreen } from '../screens/MonthOccasionsScreen';
import { FollowMonthListScreen } from '../screens/FollowMonthListScreen';
import { FollowMonthOccasionsScreen } from '../screens/FollowMonthOccasionsScreen';
import { FarbrengenScreen } from '../screens/FarbrengenScreen';
import { RecordingsScreen } from '../screens/RecordingsScreen';
import { CategoryScreen } from '../screens/CategoryScreen';
import { AllYearsThisWeekScreen } from '../screens/AllYearsThisWeekScreen';
import { OccasionAllYearsScreen } from '../screens/OccasionAllYearsScreen';

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
      <Stack.Screen name="MonthOccasions" component={MonthOccasionsScreen} />
      <Stack.Screen name="FollowMonthList" component={FollowMonthListScreen} />
      <Stack.Screen name="FollowMonthOccasions" component={FollowMonthOccasionsScreen} />
      <Stack.Screen name="Farbrengen" component={FarbrengenScreen} />
      <Stack.Screen name="Recordings" component={RecordingsScreen} />
      <Stack.Screen name="Category" component={CategoryScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Downloaded" component={DownloadedScreen} />
      <Stack.Screen name="DownloadSettings" component={DownloadSettingsScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="AllYearsThisWeek" component={AllYearsThisWeekScreen} />
      <Stack.Screen name="OccasionAllYears" component={OccasionAllYearsScreen} />
    </Stack.Navigator>
  );
}
