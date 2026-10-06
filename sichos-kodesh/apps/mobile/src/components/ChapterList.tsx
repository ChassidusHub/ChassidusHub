import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, Download, Pause, Play } from 'lucide-react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { chapterTitle } from '@sichos-kodesh/app-core';
import { useChapterDownload } from '../download/useChapterDownload';
import { useOnlineMode } from '../appMode/appMode';
import { useTranslation } from '../i18n/useTranslation';
import { playlistForEntry } from '../player/playerContext';
import type { PlayerContextValue } from '../player/playerContext';
import { chapterProgressFraction, getOccasionProgress, isChapterFinished } from '../player/progressStore';
import type { OccasionProgress, ProgressStore } from '../player/progressStore';
import { usePlayer } from '../player/usePlayer';
import { formatTime } from '../utils/formatDuration';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { DownloadProgressRing } from './DownloadProgressRing';

interface PlaylistRowProps {
  entry: CatalogEntry;
  index: number;
  downloads: boolean;
  isActive: boolean;
  player: PlayerContextValue;
  progress: OccasionProgress | undefined;
}

/** Its own component because it calls `useChapterDownload` - one hook instance per row. */
function PlaylistRow({ entry, index, downloads, isActive, player, progress }: PlaylistRowProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const chapter = entry.audio[index]!;
  const download = useChapterDownload(entry, index);
  const onlineMode = useOnlineMode();
  const finished = !isActive && isChapterFinished(progress, index, chapter);
  // The active row's fraction comes from the player's live position, not the stored snapshot - what keeps the playing row's bar moving in real time.
  const fraction = isActive ? (player.duration > 0 ? Math.min(player.currentTime / player.duration, 1) : 0) : finished ? 0 : chapterProgressFraction(progress, index, chapter);
  const tint = isActive ? colors.accent : colors.muted;

  let downloadIcon = null;
  if (!onlineMode || !downloads) {
    // Offline pack mode, or a list whose page saves its files another way: no download icons at all.
    downloadIcon = null;
  } else if (download.state === 'loading') {
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
          player.play(playlistForEntry(entry), index, savedPosition);
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
          {chapterTitle(chapter, index, language, t.track)}
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

/**
 * A farbrengen's chapters, in playing order (web: components/ChapterList.tsx):
 * each plays (or pauses) where it was left, with its progress and its own
 * download mark - left out with `downloads: false`, for a library item's
 * page, which saves its files with its own pill.
 */
export function ChapterList({ entry, progressMap, downloads = true }: { entry: CatalogEntry; progressMap: ProgressStore; downloads?: boolean }) {
  const player = usePlayer();
  const isThisPlaylistActive = player.playlist?.hebrewYear === entry.hebrewYear && player.playlist?.occasionId === entry.occasionId;
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);
  return (
    <View>
      {entry.audio.map((chapter, index) => (
        <PlaylistRow key={chapter.workerFilename} entry={entry} index={index} downloads={downloads} isActive={isThisPlaylistActive && player.currentIndex === index} player={player} progress={progress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
