import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import type { WeekOccasion } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';
import type { ThisWeekScreenProps } from '../navigation/types';

function Separator() {
  return <View style={styles.separator} />;
}

export function ThisWeekScreen({ navigation, route }: ThisWeekScreenProps) {
  const { sourceYear } = route.params;
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);
  const [selected, setSelected] = useState<WeekOccasion | null>(null);

  if (selected) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.back}>{'< back to this week'}</Text>
          </Pressable>
          <Text style={styles.title}>{selected.entry.occasionLabel}</Text>
          <Text style={styles.subtitle}>{selected.gregorianDate}</Text>
          <OccasionDetail
            key={selected.entry.occasionId}
            entry={selected.entry}
            onOpenPdf={(pdf) =>
              navigation.navigate('PdfViewer', {
                hebrewYear: selected.entry.hebrewYear,
                occasionId: selected.entry.occasionId,
                driveFileId: pdf.driveFileId,
                resourceKey: pdf.resourceKey ?? null,
                label: pdf.label,
                hasAudio: selected.entry.audio.length > 0,
              })
            }
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'< change year'}</Text>
        </Pressable>
        <Text style={styles.title}>This week</Text>
        <Text style={styles.subtitle}>From Hebrew year {sourceYear}</Text>

        {occasions.length === 0 && (
          <Text style={styles.gap}>Nothing indexed for this week in {sourceYear} or nearby kvius-matched years.</Text>
        )}
      </View>
      <FlatList
        data={occasions}
        keyExtractor={(item) => String(item.entry.occasionId)}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setSelected(item)}>
            <Text style={styles.rowText}>{item.entry.occasionLabel}</Text>
            <Text style={styles.rowSubtext}>{item.gregorianDate}</Text>
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
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  rowText: { fontSize: 16, flexShrink: 1 },
  rowSubtext: { fontSize: 13, color: '#888' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ccc' },
  gap: { fontSize: 15, color: '#a33', marginTop: 16 },
});
