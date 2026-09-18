import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { findMatchingYears, kviusCode } from '@sichos-kodesh/kvius-engine';
import type { MatchingYearResult } from '@sichos-kodesh/kvius-engine';
import type { KviusYearsScreenProps } from '../navigation/types';
import { colors, spacing } from '../ui/theme';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { SectionLabel } from '../ui/SectionLabel';
import { EmptyState } from '../ui/EmptyState';

export function KviusYearsScreen({ navigation, route }: KviusYearsScreenProps) {
  const { targetYear } = route.params;
  const matches = findMatchingYears(targetYear);

  return (
    <Screen>
      <ScreenHeader
        title="Follow Along"
        onBack={() => navigation.goBack()}
        backLabel="< Back"
      />
      <View style={styles.meta}>
        <Text style={styles.metaLine}>
          Year {targetYear} · kvius {kviusCode(targetYear)}
        </Text>
        <Text style={styles.metaHelp}>
          Kvius-matched years — "this week" resolves automatically against {targetYear}.
        </Text>
      </View>
      <SectionLabel label={`${matches.length} matched year${matches.length === 1 ? '' : 's'}`} />
      <FlatList
        data={matches}
        keyExtractor={(item) => String(item.hebrewYear)}
        renderItem={({ item }: { item: MatchingYearResult }) => (
          <ListRow
            label={String(item.hebrewYear)}
            sublabel={`${item.distance} year${item.distance === 1 ? '' : 's'} ago`}
            right={<Text style={styles.chevron}>›</Text>}
            onPress={() => navigation.navigate('ThisWeek', { sourceYear: item.hebrewYear })}
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        ListEmptyComponent={<EmptyState title="No matched years found" />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  metaLine: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xs },
  metaHelp: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  chevron: { fontSize: 18, color: colors.textMuted },
});
