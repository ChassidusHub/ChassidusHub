import React, { useMemo } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import { IL } from '../config';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';

interface Props {
  targetYear: number;
  sourceYear: number;
  onBack: () => void;
}

export function ThisWeekScreen({ targetYear, sourceYear, onBack }: Props) {
  const occasion = useMemo(() => resolveThisWeek(targetYear, sourceYear, IL, catalog), [targetYear, sourceYear]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< change year'}</Text>
        </Pressable>
        <Text style={styles.title}>{occasion.label}</Text>
        <Text style={styles.subtitle}>{occasion.gregorianDate}</Text>

        {occasion.resolution.status === 'gap' && (
          <Text style={styles.gap}>Nothing indexed for this occasion in {sourceYear} or nearby kvius-matched years.</Text>
        )}

        {occasion.entry && (
          <>
            <Text style={styles.sectionHeader}>From Hebrew year {occasion.resolution.resolvedYear}</Text>
            <OccasionDetail key={occasion.entry.occasionId} entry={occasion.entry} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  back: { color: '#3366cc', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  sectionHeader: { fontSize: 14, color: '#888', marginTop: 8, marginBottom: 8 },
  gap: { fontSize: 15, color: '#a33', marginTop: 16 },
});
