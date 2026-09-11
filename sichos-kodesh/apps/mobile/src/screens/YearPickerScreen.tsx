import React, { useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { browsableYears } from '@sichos-kodesh/catalog';
import { findMatchingYears, kviusCode } from '@sichos-kodesh/kvius-engine';
import type { MatchingYearResult } from '@sichos-kodesh/kvius-engine';
import catalog from '../catalog/data';

interface Props {
  targetYear: number;
  onSelectKviusYear: (hebrewYear: number) => void;
  onSelectBrowseYear: (hebrewYear: number) => void;
  onOpenSettings: () => void;
}

function Separator() {
  return <View style={styles.separator} />;
}

export function YearPickerScreen({ targetYear, onSelectKviusYear, onSelectBrowseYear, onOpenSettings }: Props) {
  const [tab, setTab] = useState<'kvius' | 'browse'>('kvius');

  // No range options: defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR],
  // the real span of packages/mafteiach-index's crawled catalog - every
  // candidate offered here is a year that could actually have a recording,
  // not just a kvius-matched one with nothing behind it.
  const matches = findMatchingYears(targetYear);
  const allYears = browsableYears(catalog);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Sichos Kodesh</Text>
        <Pressable onPress={onOpenSettings}>
          <Text style={styles.settingsLink}>⚙</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        Hebrew year {targetYear} (kvius {kviusCode(targetYear)})
      </Text>

      <View style={styles.tabs}>
        <Pressable style={styles.tab} onPress={() => setTab('kvius')}>
          <Text style={[styles.tabText, tab === 'kvius' && styles.tabTextActive]}>Follow along</Text>
          {tab === 'kvius' && <View style={styles.tabUnderline} />}
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('browse')}>
          <Text style={[styles.tabText, tab === 'browse' && styles.tabTextActive]}>Browse any year</Text>
          {tab === 'browse' && <View style={styles.tabUnderline} />}
        </Pressable>
      </View>

      {tab === 'kvius' ? (
        <>
          <Text style={styles.tabHelp}>
            Kvius-matched years - the week/date structure lines up with {targetYear}, so "this week" resolves automatically.
          </Text>
          <FlatList
            data={matches}
            keyExtractor={(item) => String(item.hebrewYear)}
            renderItem={({ item }: { item: MatchingYearResult }) => (
              <Pressable style={styles.row} onPress={() => onSelectKviusYear(item.hebrewYear)}>
                <Text style={styles.rowText}>{item.hebrewYear}</Text>
                <Text style={styles.rowSubtext}>{item.distance} years ago</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={Separator}
          />
        </>
      ) : (
        <>
          <Text style={styles.tabHelp}>Every year with something indexed - explore freely, no kvius match required.</Text>
          <FlatList
            data={allYears}
            keyExtractor={(item) => String(item)}
            renderItem={({ item }: { item: number }) => (
              <Pressable style={styles.row} onPress={() => onSelectBrowseYear(item)}>
                <Text style={styles.rowText}>{item}</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={Separator}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsLink: { fontSize: 20, color: '#888' },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc', marginBottom: 4 },
  tab: { marginRight: 20, paddingBottom: 10 },
  tabText: { fontSize: 15, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#3366cc' },
  tabUnderline: { height: 2, backgroundColor: '#3366cc', marginTop: 8 },
  tabHelp: { fontSize: 12, color: '#888', marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  rowText: { fontSize: 18 },
  rowSubtext: { fontSize: 14, color: '#888' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ccc' },
});
