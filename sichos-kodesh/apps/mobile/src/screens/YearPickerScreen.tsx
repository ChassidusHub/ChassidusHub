import React from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { findMatchingYears, kviusCode } from '@sichos-kodesh/kvius-engine';
import type { MatchingYearResult } from '@sichos-kodesh/kvius-engine';

interface Props {
  targetYear: number;
  onSelectYear: (hebrewYear: number) => void;
}

function Separator() {
  return <View style={styles.separator} />;
}

export function YearPickerScreen({ targetYear, onSelectYear }: Props) {
  // No range options: defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR],
  // the real span of packages/mafteiach-index's crawled catalog - every
  // candidate offered here is a year that could actually have a recording,
  // not just a kvius-matched one with nothing behind it.
  const matches = findMatchingYears(targetYear);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Follow along with...</Text>
      <Text style={styles.subtitle}>
        Hebrew year {targetYear} (kvius {kviusCode(targetYear)})
      </Text>
      <FlatList
        data={matches}
        keyExtractor={(item) => String(item.hebrewYear)}
        renderItem={({ item }: { item: MatchingYearResult }) => (
          <Pressable style={styles.row} onPress={() => onSelectYear(item.hebrewYear)}>
            <Text style={styles.rowText}>{item.hebrewYear}</Text>
            <Text style={styles.rowSubtext}>{item.distance} years ago</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={Separator}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  rowText: { fontSize: 18 },
  rowSubtext: { fontSize: 14, color: '#888' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ccc' },
});
