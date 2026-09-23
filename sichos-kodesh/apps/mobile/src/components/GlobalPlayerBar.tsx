import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import { usePlayer } from '../player/usePlayer';
import { useTranslation } from '../i18n/useTranslation';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';
import { formatTime } from '../utils/formatDuration';
import { AppText } from '../ui/Text';
import { Spinner } from '../ui/Spinner';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { Scrubber } from './Scrubber';

/**
 * The single, always-mounted (at the app root, beside the navigator)
 * player bar - Spotify/YouTube-style: survives navigating between screens
 * because it reads from PlayerContext rather than owning playback itself.
 * Renders nothing until something has actually been played this session.
 * Swiping down on it collapses it to a one-line summary; swiping up (or
 * tapping the summary) expands it again.
 */
export function GlobalPlayerBar() {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const player = usePlayer();
  const { height: windowHeight } = useWindowDimensions();
  const [showChapters, setShowChapters] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 40 && !collapsedRef.current) {
          setCollapsed(true);
          setShowChapters(false);
        } else if (gesture.dy < -40 && collapsedRef.current) {
          setCollapsed(false);
        }
      },
    }),
  ).current;

  if (!player.playlist) return null;

  const { audio } = player.playlist;
  const current = audio[player.currentIndex] ?? audio[0]!;
  const hasPrev = player.currentIndex > 0;
  const hasNext = player.currentIndex < audio.length - 1;
  const progressPercent = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const displayedPercent = dragPercent ?? progressPercent;
  const chapterLabel = current.chapterName ?? (audio.length > 1 ? t.track(player.currentIndex + 1) : null);
  const dateLabel = hebrewFullDateLabel(player.playlist.hebrewDate, player.playlist.hebrewYear, language);
  const subtitle = `${dateLabel}${chapterLabel ? ` · ${audio.length > 1 ? `${player.currentIndex + 1}/${audio.length} · ${chapterLabel}` : chapterLabel}` : ''}`;
  const errorText = player.error ? (player.error.offline ? t.audioOfflineNotDownloaded : t.audioLoadError) : null;

  const titleBlock = (
    <>
      <AppText numberOfLines={1} style={[styles.titleMain, { color: colors.fg }]}>
        {player.playlist.title}
      </AppText>
      <AppText numberOfLines={1} style={[styles.titleSub, { color: colors.muted }]}>
        {subtitle}
      </AppText>
    </>
  );

  return (
    <View {...swipe.panHandlers} style={[styles.player, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
      {showChapters && !collapsed && (
        <ScrollView style={[styles.chapters, { maxHeight: windowHeight * 0.4, borderBottomColor: colors.border }]}>
          <AppText style={[styles.chaptersTitle, { color: colors.muted }]}>{player.playlist.title}</AppText>
          {audio.map((chapter, index) => {
            const active = index === player.currentIndex;
            return (
              <Pressable
                key={chapter.workerFilename}
                onPress={() => {
                  player.playChapter(index);
                  setShowChapters(false);
                }}
                style={({ pressed }) => [styles.chapter, { flexDirection: row(isRtl) }, pressed && { backgroundColor: colors.cardHover }]}
              >
                <AppText numberOfLines={1} style={[styles.chapterName, { color: active ? colors.accent : colors.fg }, active && styles.chapterActive]}>
                  {chapter.chapterName ?? t.track(index + 1)}
                </AppText>
                <AppText style={[styles.chapterDuration, { color: colors.muted }]}>{formatTime(chapter.durationMs / 1000)}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.controls, collapsed && styles.controlsCollapsed, { flexDirection: row(isRtl) }]}>
        {collapsed ? (
          <Pressable onPress={() => setCollapsed(false)} style={styles.summary}>
            {titleBlock}
            {errorText ? (
              <AppText style={[styles.error, { color: colors.danger }]}>{errorText}</AppText>
            ) : (
              <View style={[styles.collapsedTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.collapsedFill, { backgroundColor: colors.accent, width: `${displayedPercent}%` }, isRtl ? styles.fillRtl : styles.fillLtr]} />
              </View>
            )}
          </Pressable>
        ) : (
          <>
            {/* Pinned LTR regardless of language - prev/play/next are a fixed physical control cluster, like every real media player. */}
            <View style={styles.transport}>
              {audio.length > 1 && (
                <Pressable onPress={player.prev} disabled={!hasPrev} accessibilityRole="button" accessibilityLabel={t.previousChapter} style={[styles.skip, !hasPrev && styles.disabled]}>
                  <SkipBack size={20} color={colors.accent} fill={colors.accent} strokeWidth={0} />
                </Pressable>
              )}
              <Pressable
                onPress={player.togglePlay}
                accessibilityRole="button"
                accessibilityLabel={player.loading ? t.loading : player.playing ? t.pause : t.play}
                style={({ pressed }) => [styles.toggle, { backgroundColor: colors.accent }, pressed && styles.pressed]}
              >
                {player.loading ? (
                  <Spinner size={20} color={colors.bg} />
                ) : player.playing ? (
                  <Pause size={20} color={colors.bg} fill={colors.bg} strokeWidth={0} />
                ) : (
                  <Play size={20} color={colors.bg} fill={colors.bg} strokeWidth={0} style={styles.playNudge} />
                )}
              </Pressable>
              {audio.length > 1 && (
                <Pressable onPress={player.next} disabled={!hasNext} accessibilityRole="button" accessibilityLabel={t.nextChapter} style={[styles.skip, !hasNext && styles.disabled]}>
                  <SkipForward size={20} color={colors.accent} fill={colors.accent} strokeWidth={0} />
                </Pressable>
              )}
            </View>

            <View style={styles.scrub}>
              <Pressable onPress={() => setShowChapters((value) => !value)} style={styles.titleButton}>
                {titleBlock}
              </Pressable>
              {errorText ? (
                <AppText style={[styles.error, { color: colors.danger }]}>{errorText}</AppText>
              ) : (
                <>
                  <Scrubber percent={displayedPercent} onSeek={(percent) => player.seekToFraction(percent / 100)} onDrag={setDragPercent} accessibilityLabel={t.seek} />
                  <View style={[styles.times, { flexDirection: row(isRtl) }]}>
                    <AppText style={[styles.time, { color: colors.muted }]}>{formatTime(player.currentTime)}</AppText>
                    <AppText style={[styles.time, { color: colors.muted }]}>{formatTime(player.duration)}</AppText>
                  </View>
                </>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.global-player` - elevated background, 1px top border. */
  player: { borderTopWidth: 1 },
  /** Web: `.global-player-controls` - gap 14, padding 12px 16px. */
  controls: { alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16 },
  controlsCollapsed: { paddingVertical: 8 },
  summary: { flex: 1, gap: 4 },
  collapsedTrack: { width: '100%', height: 4, borderRadius: 999, overflow: 'hidden' },
  collapsedFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 999 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  /** Web: `.global-player-transport` - gap 14, direction ltr. */
  transport: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 0 },
  toggle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  skip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.92 },
  playNudge: { marginLeft: 2 },
  scrub: { flex: 1, minWidth: 0 },
  titleButton: { marginBottom: 4 },
  titleMain: { fontSize: 13, fontWeight: '700' },
  titleSub: { fontSize: 12 },
  times: { justifyContent: 'space-between', marginTop: 2 },
  time: { fontSize: 11 },
  error: { fontSize: 13, lineHeight: 17 },
  chapters: { borderBottomWidth: 1 },
  chaptersTitle: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 4, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.66 },
  chapter: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 12 },
  chapterName: { flexShrink: 1, fontSize: 14, fontWeight: '500' },
  chapterActive: { fontWeight: '700' },
  chapterDuration: { fontSize: 12, flexShrink: 0 },
});
