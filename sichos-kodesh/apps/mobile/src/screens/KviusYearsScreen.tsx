import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { findMatchingYears, kviusCode } from '@sichos-kodesh/kvius-engine';
import type { MatchingYearResult } from '@sichos-kodesh/kvius-engine';
import type { KviusYearsScreenProps } from '../navigation/types';
import { colors, spacing, typography } from '../ui/theme';
import { Screen } from '../ui/Screen';

function Separator() {
  return <View style={styles.separator} />;
}

export function KviusYearsScreen({ navigation, route }: KviusYearsScreenProps) {
  const { targetYear } = route.params;
  const matches = findMatchingYears(targetYear);

  return (
    <Screen>
      <View style={styles.content}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'< back'}</Text>
        </Pressable>
        <Text style={styles.title}>Follow Along</Text>
        <Text style={styles.subtitle}>
          Hebrew year {targetYear} (kvius {kviusCode(targetYear)})
        </Text>
        <Text style={styles.help}>
          Kvius-matched years — the week/date structure lines up with {targetYear}, so "this week" resolves automatically.
        </Text>
      </View>
      <FlatList
        data={matches}
        keyExtractor={(item) => String(item.hebrewYear)}
        renderItem={({ item }: { item: MatchingYearResult }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('ThisWeek', { sourceYear: item.hebrewYear })}>
            <Text style={styles.rowText}>{item.hebrewYear}</Text>
            <Text style={styles.rowSubtext}>{item.distance} years ago</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  list: { paddingHorizontal: spacing.lg },
  back: { color: colors.textLink, marginBottom: spacing.md },
  title: { ...typography.titleMedium, marginBottom: spacing.xs },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  help: { ...typography.label, color: colors.textMuted, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  rowText: { fontSize: 18 },
  rowSubtext: { fontSize: 14, color: colors.textMuted },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.lg },
});
