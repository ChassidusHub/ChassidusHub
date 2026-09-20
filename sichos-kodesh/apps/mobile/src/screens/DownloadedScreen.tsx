import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { DownloadedScreenProps } from '../navigation/types';
import { useActiveDownloads } from '../download/useActiveDownloads';
import { useDownload } from '../download/useDownload';
import type { DownloadedOccasionSummary } from '../download/downloadStorage';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { colors, spacing } from '../ui/theme';

interface YearGroup {
  hebrewYear: number;
  entries: DownloadedOccasionSummary[];
}

function groupByYear(items: DownloadedOccasionSummary[]): YearGroup[] {
  const map = new Map<number, DownloadedOccasionSummary[]>();
  for (const item of items) {
    map.set(item.entry.hebrewYear, [...(map.get(item.entry.hebrewYear) ?? []), item]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([hebrewYear, entries]) => ({ hebrewYear, entries }));
}

export function DownloadedScreen({ navigation }: DownloadedScreenProps) {
  const { t } = useTranslation();
  const activeDownloads = useActiveDownloads();
  const { clearDownloads, cancelDownload, deleteOccasionDownloads, listDownloadedSummaries, hydrated, downloadedRecords } = useDownload();
  const [items, setItems] = useState<DownloadedOccasionSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDownloadedSummaries().then((next) => {
      if (!cancelled) setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [downloadedRecords, listDownloadedSummaries]);

  const yearGroups = useMemo(() => groupByYear(items ?? []), [items]);

  async function refresh(): Promise<void> {
    setItems(await listDownloadedSummaries());
  }

  function confirmClearAll(): void {
    Alert.alert(t.clearDownloadsLabel, t.deleteContentLabel, [
      { text: t.back, style: 'cancel' },
      {
        text: t.deleteContentLabel,
        style: 'destructive',
        onPress: () => {
          clearDownloads().then(() => setItems([]));
        },
      },
    ]);
  }

  function confirmDelete(summary: DownloadedOccasionSummary): void {
    Alert.alert(summary.entry.occasionLabel, t.deleteOccasionLabel, [
      { text: t.back, style: 'cancel' },
      {
        text: t.deleteOccasionLabel,
        style: 'destructive',
        onPress: () => {
          deleteOccasionDownloads(summary.entry).then(refresh);
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title={t.downloadedContentTitle} onBack={() => navigation.goBack()} backLabel={t.back} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="bodySmall" color="muted" style={styles.help}>
          {t.downloadedContentHelp}
        </AppText>

        {activeDownloads.length > 0 && (
          <View>
            <SectionLabel label={t.downloadsInProgressTitle} />
            <View style={styles.sectionWrap}>
              <Card style={styles.flatCard}>
                {activeDownloads.map((item, index) => (
                  <React.Fragment key={item.key}>
                    {index > 0 ? <RowSeparator /> : null}
                    <View style={styles.activeRow}>
                      <View style={styles.activeCopy}>
                        <AppText>{item.label}</AppText>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${Math.max(item.percent, item.status === 'queued' ? 8 : 0)}%` }]} />
                        </View>
                      </View>
                      <View style={styles.activeRowRight}>
                        <AppText variant="bodySmall" color="muted">{item.status === 'queued' ? t.downloadLabel : `${item.percent}%`}</AppText>
                        <AppButton
                          label={t.cancelDownloadLabel}
                          variant="ghost"
                          onPress={() => cancelDownload(item.key)}
                          style={styles.cancelButton}
                        />
                      </View>
                    </View>
                  </React.Fragment>
                ))}
              </Card>
            </View>
          </View>
        )}

        {items == null && !hydrated ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}

        {items != null && items.length > 0 ? (
          <View style={styles.sectionWrap}>
            <AppButton label={t.deleteContentLabel} variant="ghost" onPress={confirmClearAll} />
          </View>
        ) : null}

        {items != null && items.length === 0 && activeDownloads.length === 0 ? (
          <EmptyState title={t.noDownloadedContent} body={t.downloadForegroundOnlyHelp} />
        ) : null}

        {yearGroups.map((group) => (
          <View key={group.hebrewYear}>
            <SectionLabel label={t.hebrewYearTitle(group.hebrewYear)} />
            <View style={styles.sectionWrap}>
              <Card style={styles.flatCard}>
                {group.entries.map((summary, index) => (
                  <React.Fragment key={`${summary.entry.hebrewYear}-${summary.entry.occasionId}`}>
                    {index > 0 ? <RowSeparator /> : null}
                    <View style={styles.downloadedRow}>
                      <View style={styles.downloadedMain}>
                        <ListRow
                          label={summary.entry.occasionLabel}
                          sublabel={[summary.audioCount > 0 ? t.recordingsCount(summary.audioCount) : null, summary.pdfCount > 0 ? t.pdfCount(summary.pdfCount) : null].filter(Boolean).join(' • ')}
                          onPress={() =>
                            navigation.navigate('Farbrengen', {
                              kind: 'downloaded',
                              hebrewYear: summary.entry.hebrewYear,
                              occasionId: summary.entry.occasionId,
                            })
                          }
                          right={<AppText color="muted">›</AppText>}
                        />
                      </View>
                      <View style={styles.deleteButtonWrap}>
                        <AppButton label={t.deleteOccasionLabel} variant="ghost" onPress={() => confirmDelete(summary)} />
                      </View>
                    </View>
                  </React.Fragment>
                ))}
              </Card>
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  help: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, lineHeight: 20 },
  sectionWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  flatCard: { paddingVertical: 0, paddingHorizontal: 0 },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  activeCopy: { flex: 1 },
  activeRowRight: { alignItems: 'flex-end', gap: spacing.sm },
  cancelButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  loadingWrap: { paddingTop: spacing.xl },
  downloadedRow: {},
  downloadedMain: {},
  deleteButtonWrap: { alignItems: 'flex-end', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
});
