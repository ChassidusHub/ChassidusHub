import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { useColors } from '../ui/theme';
import { YearPickerScreen } from '../screens/YearPickerScreen';
import { KviusYearsScreen } from '../screens/KviusYearsScreen';
import { FarbrengensScreen } from '../screens/FarbrengensScreen';
import { MineScreen } from '../screens/MineScreen';
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
import { OccasionGroupScreen } from '../screens/library/OccasionGroupScreen';
import { RebbeScreen } from '../screens/seforim/RebbeScreen';
import { WorkScreen } from '../screens/seforim/WorkScreen';
import { ReaderScreen } from '../screens/seforim/ReaderScreen';
import { HebrewBooksShelfScreen } from '../screens/seforim/HebrewBooksShelfScreen';
import { MonthOccasionsScreen } from '../screens/MonthOccasionsScreen';
import { FollowMonthListScreen } from '../screens/FollowMonthListScreen';
import { FollowMonthOccasionsScreen } from '../screens/FollowMonthOccasionsScreen';
import { FarbrengenScreen } from '../screens/FarbrengenScreen';
import { AllYearsThisWeekScreen } from '../screens/AllYearsThisWeekScreen';
import { OccasionAllYearsScreen } from '../screens/OccasionAllYearsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const colors = useColors();
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="Home" component={YearPickerScreen} />
      <Stack.Screen name="KviusYears" component={KviusYearsScreen} />
      <Stack.Screen name="Farbrengens" component={FarbrengensScreen} />
      <Stack.Screen name="ThisWeek" component={ThisWeekScreen} />
      <Stack.Screen name="YearBrowser" component={YearBrowserScreen} />
      <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="MonthOccasions" component={MonthOccasionsScreen} />
      <Stack.Screen name="FollowMonthList" component={FollowMonthListScreen} />
      <Stack.Screen name="FollowMonthOccasions" component={FollowMonthOccasionsScreen} />
      <Stack.Screen name="Farbrengen" component={FarbrengenScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Mine" component={MineScreen} />
      <Stack.Screen name="Downloaded" component={DownloadedScreen} />
      <Stack.Screen name="DownloadSettings" component={DownloadSettingsScreen} />
      <Stack.Screen name="Offline" component={OfflineScreen} />
      <Stack.Screen name="Library" component={LibraryScreen} />
      <Stack.Screen name="LibraryCollection" component={LibraryCollectionScreen} />
      <Stack.Screen name="LibraryGroup" component={LibraryGroupScreen} />
      <Stack.Screen name="LibraryItem" component={LibraryItemScreen} />
      <Stack.Screen name="OccasionGroup" component={OccasionGroupScreen} />
      <Stack.Screen name="Rebbe" component={RebbeScreen} />
      <Stack.Screen name="Work" component={WorkScreen} />
      <Stack.Screen name="Reader" component={ReaderScreen} />
      <Stack.Screen name="HebrewBooksShelf" component={HebrewBooksShelfScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="AllYearsThisWeek" component={AllYearsThisWeekScreen} />
      <Stack.Screen name="OccasionAllYears" component={OccasionAllYearsScreen} />
    </Stack.Navigator>
  );
}
