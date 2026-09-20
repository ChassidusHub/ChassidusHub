import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useDownload } from '../download/useDownload';
import { useDownloadState } from '../download/useDownloadState';
import { useTranslation } from '../i18n/useTranslation';
import type { FarbrengenScreenProps } from '../navigation/types';
import { usePlayer } from '../player/usePlayer';
import { resolveOccasionRoute, splitFarbrengenContent } from '../routes/catalogRoutes';
import { ShareButton } from '../components/ShareButton';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ListRow } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { colors, spacing, typography } from '../ui/theme';
import catalog from '../catalog/data';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';

function totalDurationLabel(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function FarbrengenScreen({ navigation, route }: FarbrengenScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const { playOccasion, togglePlay, chapters, isPlaying, isLoading, hasError, errorMessage } = usePlayer();
  const { downloadOccasion } = useDownload();
  const resolved = useMemo(
    () => resolveOccasionRoute(catalog, route.params, language),
    [language, route.params],
  );
  const downloadState = useDownloadState(resolved?.entry);

  if (!resolved) {
    return (
      <Screen>
        <ScreenHeader title={t.occasionNotFound} onBack={() => navigation.goBack()} backLabel={t.back} />
        <EmptyState title={t.occasionNotFound} />
      </Screen>
    );
  }

  const { entry, backRoute } = resolved;
  const { hanachaPdfs, otherPdfs, categoryLinks } = splitFarbrengenContent(entry);
  const totalDurationMs = entry.audio.reduce((sum, audio) => sum + audio.durationMs, 0);
  const totalDuration = totalDurationMs > 0 ? totalDurationLabel(totalDurationMs) : null;
  const isThisOccasionLoaded =
    chapters.length > 0 &&
    chapters[0]?.occasionId === entry.occasionId &&
    chapters[0]?.hebrewYear === entry.hebrewYear;
  const pdfsByDriveFileId = new Map(entry.pdfs.map((pdf) => [pdf.driveFileId, pdf]));

  function navigateBack(): void {
    switch (backRoute.name) {
      case 'AllYearsThisWeek':
        navigation.navigate('AllYearsThisWeek');
        return;
      case 'Search':
        navigation.navigate('Search');
        return;
      case 'Downloaded':
        navigation.navigate('Downloaded');
        return;
      case 'ThisWeek':
        navigation.navigate('ThisWeek', backRoute.params);
        return;
      case 'MonthOccasions':
        navigation.navigate('MonthOccasions', backRoute.params);
        return;
      case 'FollowMonthOccasions':
        navigation.navigate('FollowMonthOccasions', backRoute.params);
        return;
      case 'OccasionAllYears':
        navigation.navigate('OccasionAllYears', backRoute.params);
        return;
    }
  }

  function openPdf(driveFileId: string): void {
    const pdf = pdfsByDriveFileId.get(driveFileId);
    if (!pdf) return;
    navigation.navigate('PdfViewer', {
      hebrewYear: entry.hebrewYear,
      occasionId: entry.occasionId,
      driveFileId: pdf.driveFileId,
      resourceKey: pdf.resourceKey ?? null,
      label: pdf.label,
      occasionLabel: entry.occasionLabel,
      sectionLabel: t.sectionLabels[pdf.section],
    });
  }

  return (
    <Screen>
      <ScreenHeader
        title={entry.occasionLabel}
        onBack={navigateBack}
        backLabel={t[backRoute.backLabelKey]}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="bodySmall" color="secondary" style={styles.subtitle}>
          {hebrewFullDateLabel(entry.hebrewDate, entry.hebrewYear, language)}
        </AppText>

        <ShareButton
          title={entry.occasionLabel}
          hebrewYear={entry.hebrewYear}
          occasionId={entry.occasionId}
          style={isRtl ? styles.shareButtonRtl : styles.shareButton}
        />

        {downloadState === 'downloaded' ? (
          <AppText variant="bodySmall" color="accent" style={styles.downloadState}>
            {t.downloadedLabel}
          </AppText>
        ) : (
          <AppButton
            label={t.downloadLabel}
            variant="secondary"
            style={styles.downloadButton}
            onPress={() => {
              downloadOccasion(entry).catch(() => undefined);
            }}
          />
        )}

        {entry.audio.length > 0 ? (
          <Card style={styles.sectionCard}>
            <SectionLabel label={t.recordings} />
            <AppText style={styles.recordingMeta}>
              {t.recordingsCount(entry.audio.length)}
              {totalDuration ? ` • ${totalDuration}` : ''}
            </AppText>
            <View style={styles.rowActions}>
              <AppButton
                label={isThisOccasionLoaded && !isLoading ? (isPlaying ? t.pause : t.play) : isLoading ? t.loading : t.play}
                style={styles.actionButton}
                onPress={() => {
                  if (isThisOccasionLoaded) {
                    togglePlay().catch(() => undefined);
                    return;
                  }
                  playOccasion(entry).catch(() => undefined);
                }}
              />
              <AppButton
                label={t.recordings}
                variant="secondary"
                style={styles.actionButton}
                onPress={() => navigation.navigate('Recordings', route.params)}
              />
            </View>
          </Card>
        ) : null}

        {hanachaPdfs.map((pdf) => (
          <Card key={pdf.driveFileId} style={styles.sectionCard}>
            <AppText style={styles.cardTitle}>{pdf.label}</AppText>
            <View style={styles.rowActions}>
              <AppButton
                label={t.read}
                style={styles.actionButton}
                onPress={() => openPdf(pdf.driveFileId)}
              />
              <AppButton
                label={t.sectionLabels[pdf.section]}
                variant="secondary"
                style={styles.actionButton}
                onPress={() =>
                  navigation.navigate('Category', { ...route.params, categoryId: pdf.section })
                }
              />
            </View>
          </Card>
        ))}

        {hanachaPdfs.length === 0 && entry.pdfs.length > 0 ? (
          <Card style={styles.sectionCard}>
            <AppText style={styles.cardTitle}>{t.sectionLabels.biltiMugah}</AppText>
            <AppButton
              label={t.sectionLabels.biltiMugah}
              onPress={() => navigation.navigate('Category', { ...route.params, categoryId: 'biltiMugah' })}
            />
          </Card>
        ) : null}

        {(categoryLinks.length > 0 || otherPdfs.length > 0) && (
          <View style={styles.moreSection}>
            <SectionLabel label={t.moreFromThisOccasion} />
            <Card style={styles.flatCard}>
              {categoryLinks.map((item, index) => (
                <View key={item.section} style={index > 0 ? styles.rowBorder : undefined}>
                  <ListRow
                    label={t.sectionLabels[item.section]}
                    sublabel={t.pdfCount(item.count)}
                    right={<AppText color="muted">›</AppText>}
                    onPress={() =>
                      navigation.navigate('Category', { ...route.params, categoryId: item.section })
                    }
                  />
                </View>
              ))}
              {otherPdfs.map((pdf, index) => (
                <View
                  key={pdf.driveFileId}
                  style={categoryLinks.length > 0 || index > 0 ? styles.rowBorder : undefined}
                >
                  <ListRow
                    label={pdf.label}
                    right={<AppText color="muted">›</AppText>}
                    onPress={() => openPdf(pdf.driveFileId)}
                  />
                </View>
              ))}
            </Card>
          </View>
        )}

        <Card style={styles.flatCard}>
          <ListRow
            label={t.thisOccasionAllYears}
            right={<AppText color="muted">›</AppText>}
            onPress={() =>
              navigation.navigate('OccasionAllYears', {
                sourceHebrewYear: entry.hebrewYear,
                sourceOccasionId: entry.occasionId,
                sourceRoute: route.params,
              })
            }
          />
        </Card>

        {entry.audio.length === 0 && entry.pdfs.length === 0 ? (
          <EmptyState title={t.nothingDownloadable} />
        ) : null}
        {hasError && isThisOccasionLoaded ? (
          <AppText color="error" style={styles.error}>
            {errorMessage ?? t.audioLoadError}
          </AppText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  subtitle: { marginBottom: spacing.xs },
  shareButton: { alignSelf: 'flex-start', marginLeft: -spacing.lg },
  shareButtonRtl: { alignSelf: 'flex-end', marginLeft: 0, marginRight: -spacing.lg },
  downloadState: { marginBottom: spacing.sm },
  downloadButton: { alignSelf: 'flex-start' },
  sectionCard: { gap: spacing.sm },
  flatCard: { paddingHorizontal: 0, paddingVertical: 0 },
  recordingMeta: { ...typography.bodySmall, color: colors.textSecondary },
  cardTitle: { ...typography.bodyMedium, color: colors.textDefault },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
  moreSection: { marginTop: spacing.sm },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  error: { marginTop: spacing.sm },
});
