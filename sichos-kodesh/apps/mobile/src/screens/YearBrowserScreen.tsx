import React, { useState } from 'react';
import { ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { mafteiachMonthName } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';
import type { YearBrowserScreenProps } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { SectionLabel } from '../ui/SectionLabel';
import { EmptyState } from '../ui/EmptyState';
import { colors, spacing } from '../ui/theme';

interface MonthSection {
  title: string;
  data: CatalogEntry[];
}

function groupByMonth(entries: CatalogEntry[]): MonthSection[] {
  const sections: MonthSection[] = [];
  for (const entry of entries) {
    const month = mafteiachMonthName(entry.hebrewDate);
    const last = sections[sections.length - 1];
    if (last && last.title === month) last.data.push(entry);
    else sections.push({ title: month, data: [entry] });
  }
  return sections;
}

export function YearBrowserScreen({ navigation, route }: YearBrowserScreenProps) {
  const { hebrewYear } = route.params;
  const entries: CatalogEntry[] = (catalog[hebrewYear] ?? []).filter(
    (e) => e.audio.length > 0 || e.pdfs.length > 0,
  );
  const [selected, setSelected] = useState<CatalogEntry | null>(null);

  if (selected) {
    return (
      <Screen>
        <ScreenHeader
          title={selected.occasionLabel}
          onBack={() => setSelected(null)}
          backLabel={`< ${hebrewYear}`}
        />
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={styles.detailDate}>{selected.hebrewDate}</Text>
          <OccasionDetail
            key={selected.occasionId}
            entry={selected}
            onOpenPdf={(pdf) =>
              navigation.navigate('PdfViewer', {
                hebrewYear: selected.hebrewYear,
                occasionId: selected.occasionId,
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

  const sections = groupByMonth(entries);

  return (
    <Screen>
      <ScreenHeader
        title={`Hebrew year ${hebrewYear}`}
        onBack={() => navigation.goBack()}
        backLabel="< Years"
      />
      <View style={styles.meta}>
        <Text style={styles.metaLine}>
          {entries.length} occasion{entries.length === 1 ? '' : 's'} indexed
        </Text>
      </View>
      {entries.length === 0 ? (
        <EmptyState title="Nothing indexed" body="No audio or PDFs found for this year." />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.occasionId)}
          renderSectionHeader={({ section }) => <SectionLabel label={section.title} />}
          renderItem={({ item }) => (
            <ListRow
              label={item.occasionLabel}
              sublabel={[
                item.audio.length > 0 ? 'audio' : '',
                item.pdfs.length > 0 ? `${item.pdfs.length} pdf${item.pdfs.length === 1 ? '' : 's'}` : '',
              ]
                .filter(Boolean)
                .join(' + ')}
              right={<Text style={styles.chevron}>›</Text>}
              onPress={() => setSelected(item)}
            />
          )}
          ItemSeparatorComponent={RowSeparator}
          stickySectionHeadersEnabled={false}
        />
      )}
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
