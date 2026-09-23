import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, ChevronDown, ChevronRight, Download } from 'lucide-react-native';
import type { CatalogPdf } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { DownloadProgressRing } from '../components/DownloadProgressRing';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';
import { ShareButton } from '../components/ShareButton';
import { useDownload } from '../download/useDownload';
import { useDownloadProgress } from '../download/useDownloadProgress';
import { useDownloadState } from '../download/useDownloadState';
import { useTranslation } from '../i18n/useTranslation';
import type { FarbrengenScreenProps } from '../navigation/types';
import { usePlayer } from '../player/usePlayer';
import { useProgressMap } from '../player/useProgressMap';
import { useRecordVisit } from '../player/useRecordVisit';
import { resolveOccasionRoute, splitFarbrengenContent } from '../routes/catalogRoutes';
import { useAutoplayOnHanacha } from '../settings/autoplayOnHanacha';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { Button } from '../ui/Button';
import { Card, PdfLabel } from '../ui/Card';
import { CategoryRow } from '../ui/CategoryRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { GapMessage, Subtitle } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';

/**
 * An occasion's own page: its hanacha (and any recordings) are shown
 * inline and first, since together they *are* the farbrengen. Mugah, the
 * maamar, hagahos, hosofos, and any biltiMugah PDF citing some other,
 * unrelated source are demoted into a collapsed "More from this occasion"
 * section (web: `/follow/:year/:id`, `/browse/:year/:id`, ...).
 */
export function FarbrengenScreen({ navigation, route }: FarbrengenScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const player = usePlayer();
  const progressMap = useProgressMap();
  const [autoplayOnHanacha] = useAutoplayOnHanacha();
  const { downloadOccasion } = useDownload();
  const resolved = useMemo(() => resolveOccasionRoute(catalog, route.params, language), [language, route.params]);
  const downloadState = useDownloadState(resolved?.entry);
  const downloadProgress = useDownloadProgress(resolved?.entry);
  const [moreOpen, setMoreOpen] = useState(false);
  useRecordVisit(resolved?.entry);

  if (!resolved) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title="" />}>
        <GapMessage>{t.occasionNotFound}</GapMessage>
      </Screen>
    );
  }

  const { entry, subtitle, backRoute } = resolved;
  const { hanachaPdfs, otherPdfs, categoryLinks } = splitFarbrengenContent(entry);
  const hasMore = otherPdfs.length > 0 || categoryLinks.length > 0;
  const isEmpty = entry.audio.length === 0 && hanachaPdfs.length === 0 && !hasMore;

  function openPdf(pdf: CatalogPdf): void {
    navigation.navigate('PdfViewer', {
      hebrewYear: entry.hebrewYear,
      occasionId: entry.occasionId,
      driveFileId: pdf.driveFileId,
      resourceKey: pdf.resourceKey ?? null,
      label: pdf.label,
    });
  }

  /** Opening the hanacha also starts its recording, unless it's already this occasion's own recording that's active - then it's left exactly as it is. If a different recording is already playing, `autoplayOnHanacha` decides whether to override it. */
  function readHanacha(pdf: CatalogPdf): void {
    if (entry.audio.length > 0) {
      const isThisPlaylistActive = player.playlist?.hebrewYear === entry.hebrewYear && player.playlist?.occasionId === entry.occasionId;
      const differentRecordingPlaying = player.playing && player.playlist !== null;
      if (!isThisPlaylistActive && (!differentRecordingPlaying || autoplayOnHanacha)) {
        player.play({ title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId, hebrewDate: entry.hebrewDate }, 0);
      }
    }
    openPdf(pdf);
  }

  const moreRows = (
    <View>
      {categoryLinks.map((item) => (
        <CategoryRow key={item.section} label={t.sectionLabels[item.section]} count={item.count} onPress={() => navigation.navigate('Category', { ...route.params, categoryId: item.section })} />
      ))}
      {otherPdfs.map((pdf) => (
        <CategoryRow key={pdf.driveFileId} label={pdf.label} onPress={() => openPdf(pdf)} />
      ))}
    </View>
  );

  return (
    <Screen header={<ScreenHeader back={{ name: backRoute.name, params: backRoute.params } as never} title={entry.occasionLabel} />}>
      {/* `subtitle` is this occasion's own day+month; the year is appended here so this page shows the full date. */}
      <Subtitle>
        {subtitle} {hebrewYearLabel(entry.hebrewYear, language)}
      </Subtitle>

      <ShareButton title={entry.occasionLabel} hebrewYear={entry.hebrewYear} occasionId={entry.occasionId} />

      {downloadState !== 'unavailable' && downloadState !== 'loading' && (
        <View style={[styles.downloadState, { flexDirection: row(isRtl) }]}>
          {downloadState === 'downloaded' && (
            <>
              <CheckCircle2 size={16} color={colors.accent} />
              <AppText style={[styles.downloadStateText, { color: colors.muted }]}>{t.downloadedLabel}</AppText>
            </>
          )}
          {downloadState === 'downloading' && downloadProgress !== undefined && (
            <>
              <DownloadProgressRing size={16} progress={downloadProgress} />
              <AppText style={[styles.downloadStateText, { color: colors.muted }]}>{t.downloadingLabel}</AppText>
            </>
          )}
          {(downloadState === 'queued' || (downloadState === 'downloading' && downloadProgress === undefined)) && (
            <>
              <Spinner size={16} color={colors.muted} />
              <AppText style={[styles.downloadStateText, { color: colors.muted }]}>{t.downloadingLabel}</AppText>
            </>
          )}
          {downloadState === 'none' && (
            <Pressable
              onPress={() => {
                downloadOccasion(entry).catch(() => undefined);
              }}
              hitSlop={6}
              accessibilityRole="button"
              style={({ pressed }) => [styles.downloadButton, { flexDirection: row(isRtl) }, pressed && styles.pressed]}
            >
              <Download size={16} color={colors.accent} />
              <AppText style={[styles.downloadStateText, { color: colors.accent }]}>{t.downloadLabel}</AppText>
            </Pressable>
          )}
        </View>
      )}

      {isEmpty && <GapMessage>{t.nothingDownloadable}</GapMessage>}

      {entry.audio.length > 0 && (
        <CategoryRow
          label={t.recordings}
          count={t.recordingsCount(entry.audio.length)}
          trailing={<PlaylistPlayButton entry={entry} progressMap={progressMap} variant="compact" />}
          onPress={() => navigation.navigate('Recordings', route.params)}
        />
      )}

      {hanachaPdfs.map((pdf) => (
        <Card key={pdf.driveFileId}>
          <PdfLabel>{pdf.label}</PdfLabel>
          <Button label={t.read} lastInCard onPress={() => readHanacha(pdf)} />
        </Card>
      ))}

      {hasMore &&
        (hanachaPdfs.length > 0 ? (
          // With a hanacha present this is secondary content, collapsed by default (the web's <details>).
          <View style={[styles.moreSection, moreOpen && styles.moreSectionOpen]}>
            <Pressable onPress={() => setMoreOpen((open) => !open)} hitSlop={6} accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} style={[styles.moreSummary, { flexDirection: row(isRtl) }]}>
              {/* The web's native <details> disclosure marker. */}
              {moreOpen ? <ChevronDown size={14} color={colors.muted} /> : <ChevronRight size={14} color={colors.muted} style={isRtl && styles.mirrored} />}
              <AppText style={[styles.moreSummaryText, { color: colors.muted }]}>{t.moreFromThisOccasion}</AppText>
            </Pressable>
            {moreOpen && moreRows}
          </View>
        ) : (
          // With no hanacha at all this is the only content this occasion has, so it's shown directly.
          <View style={styles.moreStandalone}>{moreRows}</View>
        ))}

      <CategoryRow label={t.thisOccasionAllYears} onPress={() => navigation.navigate('OccasionAllYears', { sourceHebrewYear: entry.hebrewYear, sourceOccasionId: entry.occasionId })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.occasion-download-state` - row, gap 6, margin-bottom 12, 14px/600 muted. */
  downloadState: { alignItems: 'center', gap: 6, marginBottom: 12 },
  downloadStateText: { fontSize: 14, fontWeight: '600' },
  downloadButton: { alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.7 },
  /** Web: `.more-section` - margin-top 24; `[open]` also margin-bottom 24. */
  moreSection: { marginTop: 24 },
  moreSectionOpen: { marginBottom: 24 },
  moreStandalone: { marginBottom: 24 },
  /** Web: `.more-section-summary` - muted 13px/700 uppercase, margin-bottom 12. */
  moreSummary: { alignItems: 'center', gap: 4, marginBottom: 12, alignSelf: 'flex-start' },
  moreSummaryText: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.78 },
  mirrored: { transform: [{ scaleX: -1 }] },
});
