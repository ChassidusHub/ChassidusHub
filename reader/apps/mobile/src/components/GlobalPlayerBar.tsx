import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react-native';
import { audioChapterName, chapterTitle } from '@chassidushub-reader/app-core';
import { formatPlaybackRate, nextPlaybackRate } from '@chassidushub-reader/catalog';
import { playlistTitle, SKIP_SECONDS } from '../player/playerContext';
import type { PlayerContextValue } from '../player/playerContext';
import { usePlayer } from '../player/usePlayer';
import { useTranslation } from '../i18n/useTranslation';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';
import { formatTime } from '../utils/formatDuration';
import { BottomSheet } from '../ui/BottomSheet';
import { AppText } from '../ui/Text';
import { Spinner } from '../ui/Spinner';
import { DISPLAY_FONT, useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { Scrubber } from './Scrubber';

/** The mini player above the tabs; the full player open over the screen; or put away, with only a pull-up handle left at the bottom edge. Same states as the web's GlobalPlayerBar. */
type BarMode = 'mini' | 'full' | 'hidden';

/** How far (pt) a swipe has to travel to count. */
const SWIPE = 40;

/** The play/pause button, spinning while the audio is still coming. */
function PlayToggle({ player, size, diameter }: { player: PlayerContextValue; size: number; diameter: number }) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Pressable
      onPress={player.togglePlay}
      accessibilityRole="button"
      accessibilityLabel={player.loading ? t.loading : player.playing ? t.pause : t.play}
      style={({ pressed }) => [styles.toggle, { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: colors.accent }, pressed && styles.pressed]}
    >
      {player.loading ? (
        <Spinner size={size} color={colors.bg} />
      ) : player.playing ? (
        <Pause size={size} color={colors.bg} fill={colors.bg} strokeWidth={0} />
      ) : (
        <Play size={size} color={colors.bg} fill={colors.bg} strokeWidth={0} style={styles.playNudge} />
      )}
    </Pressable>
  );
}

/**
 * The player (docs: the UI/UX redo plan, "The player"; web:
 * GlobalPlayerBar), mounted once at the app root beside the navigator, so
 * it survives moving between screens: it reads PlayerContext rather than
 * owning playback. Nothing shows until something has been played.
 *
 * The mini player sits above the tabs, never over the page: the title,
 * the chapter, a thin progress line and play/pause. Tapping it (or
 * swiping it up) opens the full player in a tall sheet - the occasion and
 * its chapter list, the position, 15 seconds back and forward, the
 * chapters before and after, and a speed control only for a shiur or a
 * chazara. Swiping the sheet down closes it; swiping the mini player down
 * puts it away and pauses, leaving a small handle - swipe up on that (or
 * tap it) and the mini player is back, paused where it was. Starting
 * something new to play brings it back on its own.
 */
export function GlobalPlayerBar() {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const player = usePlayer();
  const [mode, setMode] = useState<BarMode>('mini');
  // True from the put-away gesture until its pause has landed - `player.playing` still reads true for a moment after `pause()`.
  const [awaitingPause, setAwaitingPause] = useState(false);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const playerRef = useRef(player);
  playerRef.current = player;

  // A put-away player comes back when something starts playing again - the
  // gesture paused the playback of the moment, not every later one.
  // Derived during render, so the bar never paints a frame in the old state.
  if (mode === 'hidden') {
    if (awaitingPause && !player.playing) setAwaitingPause(false);
    else if (!awaitingPause && player.playing) setMode('mini');
  }

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -SWIPE) setMode(modeRef.current === 'hidden' ? 'mini' : 'full');
        else if (gesture.dy > SWIPE && modeRef.current === 'mini') {
          setMode('hidden');
          setAwaitingPause(playerRef.current.playing);
          playerRef.current.pause();
        }
      },
    }),
  ).current;

  if (!player.playlist) return null;

  if (mode === 'hidden') {
    return (
      <View {...swipe.panHandlers} style={[styles.player, styles.hidden, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
        <Pressable onPress={() => setMode('mini')} accessibilityRole="button" accessibilityLabel={t.showPlayer} style={styles.handle}>
          <View style={[styles.handlePill, { backgroundColor: colors.muted }]} />
        </Pressable>
      </View>
    );
  }

  const { audio } = player.playlist;
  const index = player.currentIndex;
  const current = audio[index] ?? audio[0]!;
  const progressPercent = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const displayedPercent = dragPercent ?? progressPercent;
  const chapterLabel = audioChapterName(current, language) ?? (audio.length > 1 ? t.track(index + 1) : null);
  const title = playlistTitle(player.playlist, language);
  // A library item (a Likkutei Sichos recording, a JEM event) can have no single date.
  const dateLabel = player.playlist.hebrewDate ? hebrewFullDateLabel(player.playlist.hebrewDate, player.playlist.hebrewYear, language) : '';
  const chapterPart = chapterLabel ? (audio.length > 1 ? `${index + 1}/${audio.length} · ${chapterLabel}` : chapterLabel) : '';
  const subtitle = [dateLabel, chapterPart].filter(Boolean).join(' · ');
  const errorText = player.error ? (player.error.offline ? t.audioOfflineNotDownloaded : t.audioLoadError) : null;
  // In Hebrew the position runs right to left (Scrubber), so the skips point that way too; play keeps its one shape.
  const mirror = isRtl ? styles.mirrored : undefined;
  const hasPrev = index > 0;
  const hasNext = index < audio.length - 1;

  return (
    <>
      <View {...swipe.panHandlers} style={[styles.player, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
        <View style={[styles.miniTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.miniFill, { backgroundColor: colors.accent, width: `${displayedPercent}%` }, isRtl ? styles.fillRtl : styles.fillLtr]} />
        </View>
        <View style={[styles.miniRow, { flexDirection: row(isRtl) }]}>
          <Pressable onPress={() => setMode('full')} accessibilityRole="button" accessibilityLabel={`${t.openPlayer}: ${title}`} style={styles.miniText}>
            <AppText numberOfLines={1} style={[styles.titleMain, { color: colors.fg }]}>
              {title}
            </AppText>
            <AppText numberOfLines={1} style={[styles.titleSub, { color: errorText ? colors.danger : colors.muted }]}>
              {errorText ?? subtitle}
            </AppText>
          </Pressable>
          <PlayToggle player={player} size={20} diameter={44} />
        </View>
      </View>

      <BottomSheet visible={mode === 'full'} tall onClose={() => setMode('mini')}>
        <View style={[styles.fullTop, { flexDirection: row(isRtl) }]}>
          <Pressable onPress={() => setMode('mini')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.closePlayer} style={styles.close}>
            <ChevronDown size={24} color={colors.muted} />
          </Pressable>
        </View>
        <View style={styles.now}>
          <AppText style={[styles.fullTitle, { color: colors.fg }]}>{title}</AppText>
          {dateLabel ? <AppText style={[styles.fullDate, { color: colors.muted }]}>{dateLabel}</AppText> : null}
          {chapterPart ? <AppText style={[styles.fullChapter, { color: colors.fg }]}>{chapterPart}</AppText> : null}
        </View>

        {errorText ? (
          <AppText style={[styles.error, { color: colors.danger }]}>{errorText}</AppText>
        ) : (
          <View>
            <Scrubber percent={displayedPercent} onSeek={(percent) => player.seekToFraction(percent / 100)} onDrag={setDragPercent} accessibilityLabel={t.seek} />
            <View style={[styles.times, { flexDirection: row(isRtl) }]}>
              <AppText style={[styles.time, { color: colors.muted }]}>{formatTime(player.currentTime)}</AppText>
              <AppText style={[styles.time, { color: colors.muted }]}>{formatTime(player.duration)}</AppText>
            </View>
          </View>
        )}

        <View style={[styles.transport, { flexDirection: row(isRtl) }]}>
          <Pressable onPress={player.prev} disabled={!hasPrev} accessibilityRole="button" accessibilityLabel={t.previousChapter} style={[styles.skip, !hasPrev && styles.disabled]}>
            <SkipBack size={22} color={colors.accent} fill={colors.accent} strokeWidth={0} style={mirror} />
          </Pressable>
          <Pressable onPress={() => player.seekBy(-SKIP_SECONDS)} accessibilityRole="button" accessibilityLabel={t.skipBack(SKIP_SECONDS)} style={({ pressed }) => [styles.seconds, pressed && { backgroundColor: colors.cardHover }]}>
            <RotateCcw size={30} color={colors.fg} strokeWidth={1.75} style={mirror} />
            <AppText style={[styles.secondsNumber, { color: colors.fg }]}>{SKIP_SECONDS}</AppText>
          </Pressable>
          <PlayToggle player={player} size={28} diameter={68} />
          <Pressable onPress={() => player.seekBy(SKIP_SECONDS)} accessibilityRole="button" accessibilityLabel={t.skipForward(SKIP_SECONDS)} style={({ pressed }) => [styles.seconds, pressed && { backgroundColor: colors.cardHover }]}>
            <RotateCw size={30} color={colors.fg} strokeWidth={1.75} style={mirror} />
            <AppText style={[styles.secondsNumber, { color: colors.fg }]}>{SKIP_SECONDS}</AppText>
          </Pressable>
          <Pressable onPress={player.next} disabled={!hasNext} accessibilityRole="button" accessibilityLabel={t.nextChapter} style={[styles.skip, !hasNext && styles.disabled]}>
            <SkipForward size={22} color={colors.accent} fill={colors.accent} strokeWidth={0} style={mirror} />
          </Pressable>
        </View>

        {/* Only for a shiur or a chazara - the Rebbe's own recordings have no speed control (packages/catalog's playbackPolicy). One tap moves to the next speed. */}
        {player.playbackRateAllowed && (
          <Pressable
            onPress={() => player.setPlaybackRate(nextPlaybackRate(player.playbackRate))}
            accessibilityRole="button"
            accessibilityLabel={t.playbackSpeed}
            style={({ pressed }) => [styles.rate, { borderColor: colors.border }, pressed && styles.pressed]}
          >
            <AppText style={[styles.rateText, { color: colors.muted }]}>{formatPlaybackRate(player.playbackRate)}</AppText>
          </Pressable>
        )}

        {audio.length > 1 && (
          <View style={[styles.chapters, { borderTopColor: colors.border }]}>
            <AppText style={[styles.chaptersTitle, { color: colors.muted }]}>{t.playerChapters}</AppText>
            {audio.map((chapter, i) => {
              const active = i === index;
              return (
                <Pressable
                  key={chapter.workerFilename}
                  onPress={() => player.playChapter(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.chapter, { flexDirection: row(isRtl) }, pressed && { backgroundColor: colors.cardHover }]}
                >
                  <AppText numberOfLines={1} style={[styles.chapterName, { color: active ? colors.accent : colors.fg }, active && styles.chapterActive]}>
                    {chapterTitle(chapter, i, language, t.track)}
                  </AppText>
                  <AppText style={[styles.chapterDuration, { color: colors.muted }]}>{formatTime(chapter.durationMs / 1000)}</AppText>
                </Pressable>
              );
            })}
          </View>
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  /** Web: `.global-player` - elevated background, 1px top border. */
  player: { borderTopWidth: 1 },
  /** Web: `.global-player-hidden` / `.global-player-handle` - a 22px strip with a centred pill. */
  hidden: { alignItems: 'center' },
  handle: { width: '100%', minHeight: 22, paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  handlePill: { width: 36, height: 4, borderRadius: 999, opacity: 0.6 },
  /** Web: `.mini-player-progress` - a 2px line along the bar's top edge. */
  miniTrack: { position: 'absolute', top: -1, left: 0, right: 0, height: 2, overflow: 'hidden' },
  miniFill: { position: 'absolute', top: 0, bottom: 0 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  /** Web: `.mini-player-row`. */
  miniRow: { alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 6, paddingHorizontal: 16 },
  miniText: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', gap: 3 },
  titleMain: { fontSize: 13, fontWeight: '700' },
  titleSub: { fontSize: 12 },
  toggle: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.92 },
  playNudge: { marginLeft: 2 },
  mirrored: { transform: [{ scaleX: -1 }] },
  /** Web: `.full-player-top` - the close button at the start. */
  fullTop: { alignItems: 'center' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  /** Web: `.full-player-now`. */
  now: { alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  fullTitle: { fontFamily: DISPLAY_FONT, fontSize: 24, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  fullDate: { fontSize: 14, textAlign: 'center' },
  fullChapter: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  times: { justifyContent: 'space-between', marginTop: 2 },
  time: { fontSize: 12, fontVariant: ['tabular-nums'] },
  error: { fontSize: 13, lineHeight: 17, textAlign: 'center' },
  /** Web: `.full-player-transport`. */
  transport: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  skip: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  /** Web: `.full-player-seconds` - the number sits inside the circular arrow. */
  seconds: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  secondsNumber: { position: 'absolute', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center' },
  /** Web: `.global-player-rate` in `.full-player-extras`. */
  rate: { alignSelf: 'center', minWidth: 56, height: 32, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rateText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chapters: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: -16, paddingTop: 6 },
  chaptersTitle: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 4, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.66 },
  chapter: { justifyContent: 'space-between', alignItems: 'center', minHeight: 48, paddingVertical: 10, paddingHorizontal: 20, gap: 12 },
  chapterName: { flexShrink: 1, fontSize: 14, fontWeight: '500' },
  chapterActive: { fontWeight: '700' },
  chapterDuration: { fontSize: 12, flexShrink: 0 },
});
