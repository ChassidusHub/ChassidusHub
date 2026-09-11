import React, { useState } from 'react';
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';

interface Props {
  hebrewYear: number;
  onBack: () => void;
}

function Separator() {
  return <View style={styles.separator} />;
}

/**
 * Browse mode: every entry the catalog has for one Hebrew year, not just
 * the single occasion "this week" auto-resolves to. Doesn't use the
 * kvius engine at all - a browsed year has no guaranteed week/date
 * alignment with the current Hebrew year, so there's no "this week" to
 * compute here, only "what does this year actually have."
 */
export function YearBrowserScreen({ hebrewYear, onBack }: Props) {
  // Only occasions with something real to download - an empty entry (mafteiach
  // indexed the occasion but nothing was resolved for it) is not worth a dead-end row.
  const entries: CatalogEntry[] = (catalog[hebrewYear] ?? []).filter((e) => e.audio.length > 0 || e.pdfs.length > 0);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);

  if (selected) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.back}>{'< back to ' + hebrewYear}</Text>
          </Pressable>
          <Text style={styles.title}>{selected.occasionLabel}</Text>
          <Text style={styles.subtitle}>{selected.hebrewDate}</Text>
          <OccasionDetail key={selected.occasionId} entry={selected} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< change year'}</Text>
        </Pressable>
        <Text style={styles.title}>Hebrew year {hebrewYear}</Text>
        <Text style={styles.subtitle}>
          {entries.length} occasion{entries.length === 1 ? '' : 's'} indexed
        </Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.occasionId)}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setSelected(item)}>
            <Text style={styles.rowText}>{item.occasionLabel}</Text>
            <Text style={styles.rowSubtext}>
              {item.audio.length > 0 ? 'audio' : ''}
              {item.audio.length > 0 && item.pdfs.length > 0 ? ' + ' : ''}
              {item.pdfs.length > 0 ? `${item.pdfs.length} pdf${item.pdfs.length === 1 ? '' : 's'}` : ''}
            </Text>
          </Pressable>
        )}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  list: { paddingHorizontal: 16 },
  back: { color: '#3366cc', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  rowText: { fontSize: 16, flexShrink: 1 },
  rowSubtext: { fontSize: 13, color: '#888' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ccc' },
});
