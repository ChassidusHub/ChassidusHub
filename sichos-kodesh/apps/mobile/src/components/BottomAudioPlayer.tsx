import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { downloadAudio } from '../download/download';
import { loadLocalSound } from '../audio/playLocalFile';
import type { LoadedSound } from '../audio/playLocalFile';

interface Props {
  workerFilename: string;
}

type State = { status: 'downloading'; percent: number } | { status: 'ready'; sound: LoadedSound } | { status: 'error' };

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A persistent bottom bar so an occasion's recording can keep playing
 * while its PDF is scrolled/read - rendered by PdfViewerScreen alongside
 * the embedded PDF view, not as a separate screen. No draggable seek bar
 * (would need a native slider dependency to add real linking) - play/pause
 * plus a live elapsed/duration progress bar covers the actual ask
 * ("scroll and listen at once").
 */
export function BottomAudioPlayer({ workerFilename }: Props) {
  const [state, setState] = useState<State>({ status: 'downloading', percent: 0 });
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const soundRef = useRef<LoadedSound | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const path = await downloadAudio(workerFilename, ({ received, total }) => {
          if (!cancelled) setState({ status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 });
        });
        const sound = await loadLocalSound(path);
        if (cancelled) {
          sound.release();
          return;
        }
        soundRef.current = sound;
        setState({ status: 'ready', sound });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      soundRef.current?.release();
    };
  }, [workerFilename]);

  useEffect(() => {
    if (state.status !== 'ready' || !playing) return;
    const sound = state.sound;
    const interval = setInterval(() => sound.getCurrentTime((seconds) => setCurrentTime(seconds)), 500);
    return () => clearInterval(interval);
  }, [state, playing]);

  function togglePlay() {
    if (state.status !== 'ready') return;
    if (playing) state.sound.pause();
    else state.sound.play();
    setPlaying(!playing);
  }

  const duration = state.status === 'ready' ? state.sound.duration : 0;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <View style={styles.container}>
      {state.status === 'downloading' && <Text style={styles.status}>Downloading audio... {state.percent}%</Text>}
      {state.status === 'error' && <Text style={styles.status}>Couldn't load audio</Text>}
      {state.status === 'ready' && (
        <>
          <Pressable style={styles.toggle} onPress={togglePlay}>
            <Text style={styles.toggleText}>{playing ? '⏸' : '▶'}</Text>
          </Pressable>
          <View style={styles.scrub}>
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
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  scrub: { flex: 1 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#ddd', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#3366cc' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 11, color: '#888' },
});
