import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import type { WeekOccasion } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';
import type { ThisWeekScreenProps } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { EmptyState } from '../ui/EmptyState';
import { colors, spacing } from '../ui/theme';

export function ThisWeekScreen({ navigation, route }: ThisWeekScreenProps) {
  const { sourceYear } = route.params;
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);
  const [selected, setSelected] = useState<WeekOccasion | null>(null);

  if (selected) {
    return (
      <Screen>
        <ScreenHeader
          title={selected.entry.occasionLabel}
          onBack={() => setSelected(null)}
          backLabel="< This week"
        />
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={styles.detailDate}>{selected.gregorianDate}</Text>
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
              })
            }
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="This Week" onBack={() => navigation.goBack()} backLabel="< Change year" />
      <View style={styles.meta}>
        <Text style={styles.metaLine}>From Hebrew year {sourceYear}</Text>
      </View>
      <FlatList
        data={occasions}
        keyExtractor={(item) => String(item.entry.occasionId)}
        renderItem={({ item }) => (
          <ListRow
            label={item.entry.occasionLabel}
            sublabel={item.gregorianDate}
            right={<Text style={styles.chevron}>›</Text>}
            onPress={() => setSelected(item)}
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        ListEmptyComponent={
          <EmptyState
            title="Nothing this week"
            body={`Nothing indexed for this week in ${sourceYear} or nearby kvius-matched years.`}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  metaLine: { fontSize: 14, color: colors.textSecondary },
  detailContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  detailDate: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.md },
  chevron: { fontSize: 18, color: colors.textMuted },
});
