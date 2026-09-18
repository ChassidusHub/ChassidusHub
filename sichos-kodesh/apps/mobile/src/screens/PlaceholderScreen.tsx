import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { EmptyState } from '../ui/EmptyState';
import { spacing } from '../ui/theme';

const ROUTE_LABELS: Record<keyof RootStackParamList, string> = {
  Home: 'Home',
  KviusYears: 'Follow Along',
  BrowseYears: 'Browse Years',
  ThisWeek: 'This Week',
  YearBrowser: 'Year Browser',
  MonthOccasions: 'Month Occasions',
  FollowMonthList: 'Follow Month List',
  FollowMonthOccasions: 'Follow Month Occasions',
  Farbrengen: 'Farbrengen',
  Recordings: 'Recordings',
  Category: 'Category',
  PdfViewer: 'PDF Viewer',
  Search: 'Search',
  Downloaded: 'Downloaded',
  Settings: 'Settings',
  DownloadSettings: 'Download Settings',
  About: 'About',
  AllYearsThisWeek: 'All Years This Week',
  OccasionAllYears: 'Occasion — All Years',
};

/**
 * Placeholder screen for routes that are not yet fully implemented.
 * Clearly communicates that the feature is part of the parity migration
 * and has not been built yet. Does not imply any working functionality.
 */
export function PlaceholderScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const label = ROUTE_LABELS[route.name as keyof RootStackParamList] ?? route.name;

  return (
    <Screen>
      <ScreenHeader
        title={label}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        backLabel="< Back"
      />
      <View style={styles.body}>
        <EmptyState
          title="Not yet implemented"
          body={`${label} is part of the mobile/web parity migration and has not been built yet. Coming in a future phase.`}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingBottom: spacing.xxl },
});
