import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, Download, Pause, Play } from 'lucide-react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { DownloadProgressRing } from '../components/DownloadProgressRing';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';
import { ShareButton } from '../components/ShareButton';
import { useAllChaptersDownloadState } from '../download/useAllChaptersDownloadState';
import { useChapterDownload } from '../download/useChapterDownload';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useTranslation';
import type { RecordingsScreenProps } from '../navigation/types';
import { usePlayer } from '../player/usePlayer';
import type { PlayerContextValue } from '../player/playerContext';
import { chapterProgressFraction, getOccasionProgress, isChapterFinished } from '../player/progressStore';
import type { OccasionProgress } from '../player/progressStore';
import { useProgressMap } from '../player/useProgressMap';
import { resolveOccasionRoute } from '../routes/catalogRoutes';
import { formatDuration, formatTime, totalDurationSeconds } from '../utils/formatDuration';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { GapMessage } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { hexWithAlpha } from '../ui/color';
import { row } from '../ui/rtl';

interface PlaylistRowProps {
  entry: CatalogEntry;
  index: number;
  isActive: boolean;
  player: PlayerContextValue;
  progress: OccasionProgress | undefined;
}

/** Its own component because it calls `useChapterDownload` - one hook instance per row. */
function PlaylistRow({ entry, index, isActive, player, progress }: PlaylistRowProps) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const chapter = entry.audio[index]!;
  const download = useChapterDownload(entry, index);
  const finished = !isActive && isChapterFinished(progress, index, chapter);
  // The active row's fraction comes from the player's live position, not the stored snapshot - what keeps the playing row's bar moving in real time.
  const fraction = isActive ? (player.duration > 0 ? Math.min(player.currentTime / player.duration, 1) : 0) : finished ? 0 : chapterProgressFraction(progress, index, chapter);
  const tint = isActive ? colors.accent : colors.muted;

  let downloadIcon = null;
  if (download.state === 'loading') {
    downloadIcon = <View style={[styles.loadingDot, { backgroundColor: colors.border }]} />;
  } else if (download.state === 'downloaded') {
    downloadIcon = <CheckCircle2 size={14} color={colors.accent} accessibilityLabel={t.downloadedLabel} />;
  } else if (download.state === 'downloading' && download.progress !== undefined) {
    downloadIcon = <DownloadProgressRing progress={download.progress} />;
  } else if (download.state === 'queued' || download.state === 'downloading') {
    downloadIcon = <Spinner size={14} color={colors.muted} />;
  } else if (download.state === 'none') {
    downloadIcon = (
      <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={t.downloadLabel} onPress={download.download} style={({ pressed }) => pressed && styles.pressed}>
        <Download size={14} color={colors.muted} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.rowItem, { flexDirection: row(isRtl) }]}>
      <Pressable
        style={({ pressed }) => [styles.rowButton, { flexDirection: row(isRtl) }, pressed && { backgroundColor: colors.cardHover }]}
        onPress={() => {
          // Tapping the active chapter toggles play/pause rather than restarting it.
          if (isActive) {
            player.togglePlay();
            return;
          }
          const savedPosition = progress?.chapters[index]?.position ?? 0;
          player.play({ title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId, hebrewDate: entry.hebrewDate }, index, savedPosition);
        }}
      >
        <View style={styles.rowIcon}>
          {isActive && player.loading ? (
            <Spinner size={16} color={colors.accent} />
          ) : isActive && player.playing ? (
            <Pause size={16} color={tint} fill={tint} strokeWidth={0} />
          ) : finished ? (
            <CheckCircle2 size={16} color={colors.accent} accessibilityLabel={t.finishedLabel} />
          ) : (
            <Play size={16} color={tint} fill={tint} strokeWidth={0} />
          )}
        </View>
        <AppText numberOfLines={1} style={[styles.rowName, { color: tint === colors.accent ? colors.accent : colors.fg }]}>
          {chapter.chapterName ?? t.track(index + 1)}
        </AppText>
        {/* Always rendered, even at 0%, so every row reserves the same space. */}
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.round(fraction * 100)}%` }, isRtl ? styles.fillRtl : styles.fillLtr]} />
        </View>
        <AppText style={[styles.duration, { color: colors.muted }]}>{formatTime(chapter.durationMs / 1000)}</AppText>
      </Pressable>
      <View style={styles.rowIcons}>{downloadIcon}</View>
    </View>
  );
}

/** An occasion's recordings playlist (web: `.../recordings`). */
export function RecordingsScreen({ route }: RecordingsScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const player = usePlayer();
  const progressMap = useProgressMap();
  const { downloadAllChapters } = useDownload();
  const resolved = useMemo(() => resolveOccasionRoute(catalog, route.params, language), [language, route.params]);
  const entry = resolved?.entry ?? null;
  const allChaptersState = useAllChaptersDownloadState(entry ?? { hebrewYear: 0, occasionId: 0, hebrewDate: '', occasionLabel: '', audio: [], pdfs: [] });

  if (!entry) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title="" />}>
        <GapMessage>{t.pageNotFound}</GapMessage>
      </Screen>
    );
  }

  const isThisPlaylistActive = player.playlist?.hebrewYear === entry.hebrewYear && player.playlist?.occasionId === entry.occasionId;
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);
  const totalDuration = formatDuration(totalDurationSeconds(entry.audio));

  let headerDownload = null;
  if (allChaptersState === 'downloaded') {
    headerDownload = (
      <View style={styles.headerStatus} accessibilityLabel={t.downloadedLabel}>
        <CheckCircle2 size={18} color={colors.accent} />
      </View>
    );
  } else if (allChaptersState === 'downloading') {
    headerDownload = (
      <View style={styles.headerStatus} accessibilityLabel={t.downloadingLabel}>
        <Spinner size={18} color={colors.muted} />
      </View>
    );
  } else if (allChaptersState === 'none') {
    headerDownload = (
      <Pressable
        onPress={() => {
          downloadAllChapters(entry).catch(() => undefined);
        }}
        accessibilityRole="button"
        accessibilityLabel={t.downloadAllRecordingsLabel}
        style={({ pressed }) => [styles.headerAction, { backgroundColor: hexWithAlpha(colors.accent, 0.14) }, pressed && styles.pressed]}
      >
        <Download size={18} color={colors.accent} />
      </Pressable>
    );
  }

  return (
    <Screen header={<ScreenHeader back={{ name: 'Farbrengen', params: route.params }} title={entry.occasionLabel} />}>
      <View style={[styles.playlistHeader, { backgroundColor: colors.cardBg, flexDirection: row(isRtl) }]}>
        <View style={[styles.playlistHeaderMain, { flexDirection: row(isRtl) }]}>
          <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="large" />
          <View style={styles.playlistHeaderCopy}>
            <AppText style={styles.playlistTitle}>{entry.occasionLabel}</AppText>
            <AppText style={[styles.playlistSubtitle, { color: colors.muted }]}>{totalDuration}</AppText>
          </View>
        </View>
        {headerDownload && <View style={styles.playlistHeaderSide}>{headerDownload}</View>}
      </View>

      <ShareButton title={entry.occasionLabel} hebrewYear={entry.hebrewYear} occasionId={entry.occasionId} />

      {entry.audio.map((chapter, index) => (
        <PlaylistRow key={chapter.workerFilename} entry={entry} index={index} isActive={isThisPlaylistActive && player.currentIndex === index} player={player} progress={progress} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.playlist-header` - space-between, gap 16, margin-bottom 16, padding 16, radius 16. */
  playlistHeader: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, padding: 16, borderRadius: 16 },
  playlistHeaderMain: { alignItems: 'center', gap: 16, minWidth: 0, flex: 1 },
  playlistHeaderCopy: { minWidth: 0, flexShrink: 1, gap: 4 },
  playlistTitle: { fontSize: 18, fontWeight: '700' },
  playlistSubtitle: { fontSize: 14 },
  playlistHeaderSide: { alignItems: 'center', justifyContent: 'center', minHeight: 44, flexShrink: 0 },
  headerStatus: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  /** Web: `.playlist-header-action` - 36px tinted circle. */
  headerAction: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  /** Web: `.playlist-row-item` - gap 10, radius 8, padding 10, margin-inline -10. */
  rowItem: { alignItems: 'center', gap: 10, borderRadius: 8, padding: 10, marginHorizontal: -10 },
  rowButton: { flex: 1, minWidth: 0, alignItems: 'center', gap: 14, borderRadius: 8 },
  rowIcon: { width: 20, alignItems: 'center', flexShrink: 0 },
  rowName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '600' },
  /** Web: `.playlist-row-progress-track` - 32x3 sliver. */
  progressTrack: { width: 32, height: 3, borderRadius: 999, overflow: 'hidden', flexShrink: 0 },
  progressFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 999 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  /** Web: `.playlist-row-duration` - fixed 6ch, tabular, end-aligned, 13px muted. */
  duration: { width: 48, fontSize: 13, textAlign: 'right', flexShrink: 0, fontVariant: ['tabular-nums'] },
  rowIcons: { width: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  loadingDot: { width: 8, height: 8, borderRadius: 4 },
  pressed: { opacity: 0.7 },
});
