import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { mafteiachMonthName } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';
import { useTranslation } from '../i18n/useTranslation';
import { useDownloadState } from '../download/useDownloadState';
import type { YearBrowserScreenProps } from '../navigation/types';
import { AppText } from '../ui/AppText';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { SectionLabel } from '../ui/SectionLabel';
import { EmptyState } from '../ui/EmptyState';
import { spacing } from '../ui/theme';

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

function StatusAccessory({ entry }: { entry: CatalogEntry }) {
  const state = useDownloadState(entry);
  if (state === 'downloaded') return <AppText color="accent">✓</AppText>;
  if (state === 'downloading') return <AppText color="accent">↓</AppText>;
  if (state === 'queued') return <AppText color="muted">…</AppText>;
  if (state === 'error') return <AppText color="error">!</AppText>;
  return null;
}

export function YearBrowserScreen({ navigation, route }: YearBrowserScreenProps) {
  const { hebrewYear, initialOccasionId } = route.params;
  const entries: CatalogEntry[] = useMemo(
    () => (catalog[hebrewYear] ?? []).filter((e) => e.audio.length > 0 || e.pdfs.length > 0),
    [hebrewYear],
  );
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    setSelected(initialOccasionId != null ? (entries.find((entry) => entry.occasionId === initialOccasionId) ?? null) : null);
  }, [entries, initialOccasionId]);

  if (selected) {
    return (
      <Screen>
        <ScreenHeader
          title={selected.occasionLabel}
          onBack={() => setSelected(null)}
          backLabel={t.back}
        />
        <ScrollView contentContainerStyle={styles.detailContent}>
          <AppText color="secondary" style={styles.detailDate}>{selected.hebrewDate}</AppText>
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
        title={t.hebrewYearTitle(hebrewYear)}
        onBack={() => navigation.goBack()}
        backLabel={t.back}
      />
      <View style={styles.meta}>
        <AppText variant="bodySmall" color="secondary">{t.occasionsIndexed(entries.length)}</AppText>
      </View>
      {entries.length === 0 ? (
        <EmptyState title={t.nothingDownloadable} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.occasionId)}
          renderSectionHeader={({ section }) => <SectionLabel label={section.title} />}
          renderItem={({ item }) => (
            <ListRow
              label={item.occasionLabel}
              sublabel={[
                item.audio.length > 0 ? t.recordingsCount(item.audio.length) : '',
                item.pdfs.length > 0 ? t.pdfCount(item.pdfs.length) : '',
              ]
                .filter(Boolean)
                .join(' • ')}
              right={
                <View style={styles.rowRight}>
                  <StatusAccessory entry={item} />
                  <AppText color="muted">›</AppText>
                </View>
              }
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
  detailContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  detailDate: { marginBottom: spacing.md },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
