import React, { useMemo } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';

interface Props {
  sourceYear: number;
  onBack: () => void;
}

export function ThisWeekScreen({ sourceYear, onBack }: Props) {
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< change year'}</Text>
        </Pressable>
        <Text style={styles.title}>This week</Text>
        <Text style={styles.subtitle}>From Hebrew year {sourceYear}</Text>

        {occasions.length === 0 && (
          <Text style={styles.gap}>Nothing indexed for this week in {sourceYear} or nearby kvius-matched years.</Text>
        )}

        {occasions.map(({ entry, gregorianDate }) => (
          <View key={entry.occasionId} style={styles.occasion}>
            <Text style={styles.sectionHeader}>
              {entry.occasionLabel} ({gregorianDate})
            </Text>
            <OccasionDetail entry={entry} />
          </View>
        ))}
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
  occasion: { marginBottom: 16 },
  sectionHeader: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 8, marginBottom: 8 },
  gap: { fontSize: 15, color: '#a33', marginTop: 16 },
});
