import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CatalogAudio } from '@sichos-kodesh/catalog';
import { loadCachedSound } from '../audio/loadCachedSound';
import type { LoadedSound } from '../audio/playLocalFile';

interface Props {
  audio: CatalogAudio[];
}

type State = { status: 'loading' } | { status: 'ready'; sound: LoadedSound } | { status: 'error' };

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A persistent bottom bar so an occasion's recording can keep playing
 * while its PDF is scrolled/read - rendered by PdfViewerScreen alongside
 * the embedded PDF view, not as a separate screen.
 *
 * A farbrengen is usually several separate recordings, not one (real
 * examples run to 8-10: a few sichos, a maamar, niggunim between them) -
 * `audio`'s array order is already the real chapter/playback order (see
 * packages/mafteiach-index's jemAudio.ts), so this plays through it like a
 * real chapters list: prev/next, an expandable chapter picker, and
 * auto-advance into the next chapter when one ends. No draggable seek bar
 * (would need a native slider dependency to add real linking) - a live
 * elapsed/duration progress bar covers the actual ask ("scroll and listen
 * at once, and skip between chapters").
 *
 * Each chapter change downloads in full before playback starts (see
 * loadCachedSound - a prior streaming-while-caching attempt raced its own
 * background download for bandwidth and could get stuck after a skip), but
 * silently - just "Loading...", no progress bar - and only once per
 * chapter, since the downloaded copy is kept for next time.
 */
export function BottomAudioPlayer({ audio }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showChapters, setShowChapters] = useState(false);
  const soundRef = useRef<LoadedSound | null>(null);

  const current = audio[currentIndex]!;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < audio.length - 1;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setCurrentTime(0);
    (async () => {
      try {
        const sound = await loadCachedSound(current.workerFilename);
        if (cancelled) {
          sound.release();
          return;
        }
        soundRef.current = sound;
        setState({ status: 'ready', sound });
        if (playing) sound.play(handleEnd);
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      soundRef.current?.release();
      soundRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed only on the chapter, not `playing` (see goToChapter)
  }, [current.workerFilename]);

  useEffect(() => {
    if (state.status !== 'ready' || !playing) return;
    const sound = state.sound;
    const interval = setInterval(() => sound.getCurrentTime((seconds) => setCurrentTime(seconds)), 500);
    return () => clearInterval(interval);
  }, [state, playing]);

  function handleEnd(success: boolean) {
    if (success && hasNext) goToChapter(currentIndex + 1);
    else setPlaying(false);
  }

  function goToChapter(index: number) {
    setCurrentIndex(index);
    setShowChapters(false);
    setPlaying(true);
  }

  function togglePlay() {
    if (state.status !== 'ready') return;
    if (playing) state.sound.pause();
    else state.sound.play(handleEnd);
    setPlaying(!playing);
  }

  const duration = state.status === 'ready' ? state.sound.duration : 0;
  const progress = duration > 0 ? currentTime / duration : 0;
  const chapterLabel = current.chapterName ?? (audio.length > 1 ? `Track ${currentIndex + 1}` : null);

  return (
    <View style={styles.wrapper}>
      {showChapters && (
        <FlatList
          style={styles.chapterList}
          data={audio}
          keyExtractor={(item) => item.workerFilename}
          renderItem={({ item, index }) => (
            <Pressable style={styles.chapterRow} onPress={() => goToChapter(index)}>
              <Text style={index === currentIndex ? styles.chapterTextActive : styles.chapterText}>{item.chapterName ?? `Track ${index + 1}`}</Text>
              <Text style={styles.chapterDuration}>{formatTime(item.durationMs / 1000)}</Text>
            </Pressable>
          )}
        />
      )}
      <View style={styles.container}>
        {state.status === 'loading' && <Text style={styles.status}>Loading...</Text>}
        {state.status === 'error' && <Text style={styles.status}>Couldn't load audio</Text>}
        {state.status === 'ready' && (
          <>
            {audio.length > 1 && (
              <Pressable style={styles.skip} onPress={() => hasPrev && goToChapter(currentIndex - 1)} disabled={!hasPrev}>
                <Text style={[styles.skipText, !hasPrev && styles.skipTextDisabled]}>⏮</Text>
              </Pressable>
            )}
            <Pressable style={styles.toggle} onPress={togglePlay}>
              <Text style={styles.toggleText}>{playing ? '⏸' : '▶'}</Text>
            </Pressable>
            {audio.length > 1 && (
              <Pressable style={styles.skip} onPress={() => hasNext && goToChapter(currentIndex + 1)} disabled={!hasNext}>
                <Text style={[styles.skipText, !hasNext && styles.skipTextDisabled]}>⏭</Text>
              </Pressable>
            )}
            <View style={styles.scrub}>
              {chapterLabel && (
                <Pressable onPress={() => setShowChapters((v) => !v)}>
                  <Text style={styles.chapterToggle} numberOfLines={1}>
                    {audio.length > 1 ? `${currentIndex + 1}/${audio.length} · ${chapterLabel}` : chapterLabel}
                  </Text>
                </Pressable>
              )}
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${progress * 100}%` }]} />
              </View>
              <View style={styles.times}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chapterList: { maxHeight: 240, backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ccc' },
  chapterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  chapterText: { fontSize: 14, flexShrink: 1 },
  chapterTextActive: { fontSize: 14, flexShrink: 1, color: '#3366cc', fontWeight: '600' },
  chapterDuration: { fontSize: 12, color: '#888', marginLeft: 12 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#f2f2f2',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  status: { fontSize: 13, color: '#666' },
  toggle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3366cc', alignItems: 'center', justifyContent: 'center' },
  toggleText: { color: '#fff', fontSize: 18 },
  skip: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 16, color: '#333' },
  skipTextDisabled: { opacity: 0.3 },
  scrub: { flex: 1 },
  chapterToggle: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 4 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#ddd', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#3366cc' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 11, color: '#888' },
});
