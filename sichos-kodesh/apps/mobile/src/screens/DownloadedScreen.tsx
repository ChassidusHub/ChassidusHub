import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Download } from 'lucide-react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { itemSubtitle, itemTitle, occasionTitle } from '@sichos-kodesh/app-core';
import { getLibrary } from '../catalog/catalogStore';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { SwipeToDelete } from '../components/SwipeToDelete';
import { useActiveDownloadRows } from '../download/useActiveDownloads';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useTranslation';
import type { DownloadedLibraryItem } from '../library/libraryDownloads';
import { deleteLibraryItemFiles, listDownloadedLibraryItems } from '../library/libraryDownloads';
import type { DownloadedScreenProps } from '../navigation/types';
import { useProgressMap } from '../player/useProgressMap';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { EmptyState } from '../ui/EmptyState';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { AppText } from '../ui/Text';
import { CategoryHeader, TabHelp } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';

interface YearGroup {
  hebrewYear: number;
  entries: CatalogEntry[];
}

function groupByYear(entries: CatalogEntry[]): YearGroup[] {
  const byYear = new Map<number, CatalogEntry[]>();
  for (const entry of entries) byYear.set(entry.hebrewYear, [...(byYear.get(entry.hebrewYear) ?? []), entry]);
  return [...byYear.entries()].sort(([a], [b]) => a - b).map(([hebrewYear, yearEntries]) => ({ hebrewYear, entries: yearEntries }));
}

/** Every occasion currently downloaded, plus whatever is still in progress (web: `/downloaded`). Not gated on being offline - useful any time. */
export function DownloadedScreen({ navigation }: DownloadedScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const { clearDownloads, deleteOccasionDownloads, listDownloadedSummaries, downloadedRecords, refreshDownloads } = useDownload();
  const activeRows = useActiveDownloadRows();
  const [downloaded, setDownloaded] = useState<CatalogEntry[] | null>(null);
  // Phone only: library items (src/library) whose files are all here.
  const [libraryItems, setLibraryItems] = useState<DownloadedLibraryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    listDownloadedLibraryItems(getLibrary())
      .then((items) => {
        if (!cancelled) setLibraryItems(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [downloadedRecords]);

  useEffect(() => {
    let cancelled = false;
    // Keeps the previous result on screen during the re-check rather than resetting to a loading state on every change.
    listDownloadedSummaries().then((summaries) => {
      if (!cancelled) setDownloaded(summaries.map((summary) => summary.entry));
    });
    return () => {
      cancelled = true;
    };
  }, [downloadedRecords, listDownloadedSummaries]);

  const yearGroups = useMemo(() => (downloaded ? groupByYear(downloaded) : []), [downloaded]);

  async function deleteAllContent(): Promise<void> {
    await clearDownloads();
    setDownloaded([]);
    setLibraryItems([]);
  }

  async function deleteLibraryItem(item: DownloadedLibraryItem): Promise<void> {
    await deleteLibraryItemFiles(item.targets);
    await refreshDownloads();
    setLibraryItems(await listDownloadedLibraryItems(getLibrary()));
  }

  async function deleteOccasion(entry: CatalogEntry): Promise<void> {
    await deleteOccasionDownloads(entry);
    setDownloaded((await listDownloadedSummaries()).map((summary) => summary.entry));
  }

  return (
    <Screen header={<ScreenHeader back={{ name: 'Mine', params: undefined }} title={t.downloadedContentTitle} />}>
      <TabHelp>{t.downloadedContentHelp}</TabHelp>

      {activeRows.length > 0 && (
        <View style={styles.activeSection}>
          <CategoryHeader first>{t.downloadsInProgressTitle}</CategoryHeader>
          {activeRows.map((item) => (
            <View key={item.key} style={[styles.activeRow, { flexDirection: row(isRtl) }]}>
              <Pressable
                style={styles.activeLabel}
                onPress={() =>
                  item.library ? navigation.navigate('LibraryItem', item.library) : navigation.navigate('Farbrengen', { kind: 'browse', hebrewYear: item.hebrewYear, occasionId: item.occasionId })
                }
              >
                <AppText numberOfLines={1} style={styles.activeLabelText}>
                  {item.label}
                </AppText>
              </Pressable>
              <View style={[styles.activeTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.activeFill, { backgroundColor: colors.accent, width: `${item.percent}%` }, isRtl ? styles.fillRtl : styles.fillLtr]} />
              </View>
              <AppText style={[styles.activePercent, { color: colors.muted }]}>{item.percent}%</AppText>
            </View>
          ))}
        </View>
      )}

      {downloaded && downloaded.length === 0 && libraryItems.length === 0 && activeRows.length === 0 && <EmptyState icon={<Download size={40} color={colors.muted} />} text={t.noDownloadedContent} />}

      {downloaded && (downloaded.length > 0 || libraryItems.length > 0) && (
        <Row
          label={t.deleteContentLabel}
          marquee
          onPress={() => {
            deleteAllContent().catch(() => undefined);
          }}
        />
      )}

      {yearGroups.map(({ hebrewYear, entries }) => (
        <View key={hebrewYear}>
          <CategoryHeader>{hebrewYearLabel(hebrewYear, language)}</CategoryHeader>
          {entries.map((entry) => (
            <SwipeToDelete
              key={entry.occasionId}
              onDelete={() => {
                deleteOccasion(entry).catch(() => undefined);
              }}
            >
              <Row
                label={occasionTitle(entry, language)}
                trailing={
                  <RowTrailing>
                    <OccasionRowIcon entry={entry} progressMap={progressMap} />
                  </RowTrailing>
                }
                onPress={() => navigation.navigate('Farbrengen', { kind: 'downloaded', hebrewYear, occasionId: entry.occasionId })}
              />
            </SwipeToDelete>
          ))}
        </View>
      ))}

      {libraryItems.length > 0 && (
        <View>
          <CategoryHeader>{t.libraryTitle}</CategoryHeader>
          {libraryItems.map((downloadedItem) => (
            <SwipeToDelete
              key={`${downloadedItem.collection}:${downloadedItem.item.id}`}
              onDelete={() => {
                deleteLibraryItem(downloadedItem).catch(() => undefined);
              }}
            >
              <Row label={itemTitle(downloadedItem.collection, downloadedItem.item, language)} marquee onPress={() => navigation.navigate('LibraryItem', { collection: downloadedItem.collection, id: downloadedItem.item.id })}>
                <AppText numberOfLines={1} style={[styles.librarySubtitle, { color: colors.muted }]}>
                  {[t.collectionNames[downloadedItem.collection], itemSubtitle(downloadedItem.collection, downloadedItem.item, language)].filter(Boolean).join(' · ')}
                </AppText>
              </Row>
            </SwipeToDelete>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeSection: { marginBottom: 20 },
  /** Web: `.active-download-row` - row, gap 10; list gap 10. */
  activeRow: { alignItems: 'center', gap: 10, marginBottom: 10 },
  activeLabel: { flex: 1, minWidth: 0 },
  activeLabelText: { fontSize: 14 },
  /** Web: `.active-download-row-track` - 64x4 pill. */
  activeTrack: { width: 64, height: 4, borderRadius: 999, overflow: 'hidden', flexShrink: 0 },
  activeFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 999 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  activePercent: { width: 34, textAlign: 'right', fontSize: 12, flexShrink: 0, fontVariant: ['tabular-nums'] },
  librarySubtitle: { fontSize: 14 },
});
