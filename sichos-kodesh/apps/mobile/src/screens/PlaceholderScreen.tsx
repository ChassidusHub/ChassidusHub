import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../ui/theme';
import { Screen } from '../ui/Screen';

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
 * Used for all Phase 1B+ screens in the navigation graph. Displays
 * the route name and a note that it is part of the parity migration.
 */
export function PlaceholderScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const label = ROUTE_LABELS[route.name as keyof RootStackParamList] ?? route.name;

  return (
    <Screen>
      <View style={styles.header}>
        {navigation.canGoBack() && (
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.back}>{'< Back'}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.note}>
          This screen is part of the mobile/web parity migration and has not been fully implemented yet.
        </Text>
        <Text style={styles.phase}>Coming in a future parity phase.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  back: { color: colors.textLink, fontSize: 15 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { ...typography.titleMedium, color: colors.textDefault, marginBottom: spacing.md, textAlign: 'center' },
  note: { ...typography.bodyMedium, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm },
  phase: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
