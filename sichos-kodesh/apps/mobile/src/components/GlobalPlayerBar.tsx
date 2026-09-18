import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayer } from '../player/usePlayer';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Persistent global media player bar.
 * Shown when a queue/playlist exists (chapters.length > 0).
 * Mounted at app root so it survives screen navigation.
 */
export function GlobalPlayerBar() {
  const insets = useSafeAreaInsets();
  const { chapters, currentIndex, isPlaying, isLoading, hasError, errorMessage, position, duration, togglePlay, next, prev } =
    usePlayer();

  if (chapters.length === 0) return null;

  const current = currentIndex != null ? chapters[currentIndex] : chapters[0];
  const hasPrev = currentIndex != null && currentIndex > 0;
  const hasNext = currentIndex != null && currentIndex < chapters.length - 1;
  const progress = duration > 0 ? Math.max(0, Math.min(position / duration, 1)) : 0;

  const title = current?.chapterName ?? current?.occasionLabel ?? 'Unknown recording';
  const chapterLabel =
    chapters.length > 1 && currentIndex != null
      ? `${currentIndex + 1}/${chapters.length} · ${title}`
      : title;

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.container}>
        {chapters.length > 1 && (
          <Pressable style={styles.skip} onPress={() => { prev().catch(() => undefined); }} disabled={!hasPrev}>
            <Text style={[styles.skipText, !hasPrev && styles.skipTextDisabled]}>⏮</Text>
          </Pressable>
        )}
        <Pressable style={styles.toggle} onPress={() => { togglePlay().catch(() => undefined); }} disabled={isLoading}>
          <Text style={styles.toggleText}>
            {isLoading ? '⏳' : isPlaying ? '⏸' : '▶'}
          </Text>
        </Pressable>
        {chapters.length > 1 && (
          <Pressable style={styles.skip} onPress={() => { next().catch(() => undefined); }} disabled={!hasNext}>
            <Text style={[styles.skipText, !hasNext && styles.skipTextDisabled]}>⏭</Text>
          </Pressable>
        )}
        <View style={styles.scrub}>
          <Text style={styles.titleText} numberOfLines={1}>
            {chapterLabel}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.times}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
          {hasError ? (
            <Text style={styles.errorText} numberOfLines={1}>
              {errorMessage ?? 'Playback error'}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f2f2f2',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  toggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3366cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { color: '#fff', fontSize: 18 },
  skip: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 16, color: '#333' },
  skipTextDisabled: { opacity: 0.3 },
  scrub: { flex: 1 },
  titleText: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 4 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#ddd', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#3366cc' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 11, color: '#888' },
  errorText: { fontSize: 11, color: '#a30000', marginTop: 4 },
});
