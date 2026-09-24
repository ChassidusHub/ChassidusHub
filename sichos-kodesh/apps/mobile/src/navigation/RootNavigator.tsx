import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { useColors } from '../ui/theme';
import { YearPickerScreen } from '../screens/YearPickerScreen';
import { KviusYearsScreen } from '../screens/KviusYearsScreen';
import { BrowseYearsScreen } from '../screens/BrowseYearsScreen';
import { ThisWeekScreen } from '../screens/ThisWeekScreen';
import { YearBrowserScreen } from '../screens/YearBrowserScreen';
import { PdfViewerScreen } from '../screens/PdfViewerScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { DownloadedScreen } from '../screens/DownloadedScreen';
import { DownloadSettingsScreen } from '../screens/DownloadSettingsScreen';
import { OfflineScreen } from '../screens/OfflineScreen';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { LibraryCollectionScreen } from '../screens/library/LibraryCollectionScreen';
import { LibraryGroupScreen } from '../screens/library/LibraryGroupScreen';
import { LibraryItemScreen } from '../screens/library/LibraryItemScreen';
import { OccasionGroupsScreen } from '../screens/library/OccasionGroupsScreen';
import { OccasionGroupScreen } from '../screens/library/OccasionGroupScreen';
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
  const colors = useColors();
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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
      <Stack.Screen name="Offline" component={OfflineScreen} />
      <Stack.Screen name="Library" component={LibraryScreen} />
      <Stack.Screen name="LibraryCollection" component={LibraryCollectionScreen} />
      <Stack.Screen name="LibraryGroup" component={LibraryGroupScreen} />
      <Stack.Screen name="LibraryItem" component={LibraryItemScreen} />
      <Stack.Screen name="OccasionGroups" component={OccasionGroupsScreen} />
      <Stack.Screen name="OccasionGroup" component={OccasionGroupScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="AllYearsThisWeek" component={AllYearsThisWeekScreen} />
      <Stack.Screen name="OccasionAllYears" component={OccasionAllYearsScreen} />
    </Stack.Navigator>
  );
}
