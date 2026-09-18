import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
  useActiveTrack,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { catalogAudioToChapter, catalogAudioToTracks } from './playlist';
import type { PlayerChapter, PlayerContextValue } from './playerContext';
import { PlayerContext } from './playerContext';

interface Props {
  children: ReactNode;
}

// Promise sentinel: null = not started, in-flight promise = setting up, resolved = ready.
let playerSetupPromise: Promise<void> | null = null;

async function doSetup(): Promise<void> {
  await TrackPlayer.setupPlayer({
    autoHandleInterruptions: true,
  });
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.Stop,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
    ],
    compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ],
    progressUpdateEventInterval: 1,
  });
}

/** Idempotent: all concurrent callers await the same in-flight setup promise. */
function ensurePlayer(): Promise<void> {
  if (!playerSetupPromise) {
    playerSetupPromise = doSetup().catch((error) => {
      // Reset so a retry attempt can re-run setup.
      playerSetupPromise = null;
      throw error;
    });
  }
  return playerSetupPromise;
}

export function PlayerProvider({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [chapters, setChapters] = useState<PlayerChapter[]>([]);
  const [hasError, setHasError] = useState(false);
  const setupDoneRef = useRef(false);

  useEffect(() => {
    if (setupDoneRef.current) return;
    setupDoneRef.current = true;
    ensurePlayer()
      .then(() => setReady(true))
      .catch(() => {
        // Non-fatal: player unavailable (e.g., simulator/test env)
        setReady(false);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const sub = TrackPlayer.addEventListener(Event.PlaybackError, () => {
      setHasError(true);
    });
    return () => sub.remove();
  }, [ready]);

  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();

  const isPlaying = playbackState.state === State.Playing;
  const isLoading =
    playbackState.state === State.Loading ||
    playbackState.state === State.Buffering;

  const currentIndex =
    activeTrack != null
      ? chapters.findIndex((chapter) => chapter.workerFilename === String(activeTrack.id))
      : null;

  const playOccasion = useCallback(
    async (entry: CatalogEntry) => {
      if (!entry.audio.length) return;
      await ensurePlayer();
      setReady(true);
      setHasError(false);
      const tracks = catalogAudioToTracks(entry);
      const newChapters = entry.audio.map((audio) =>
        catalogAudioToChapter(entry, audio),
      );
      await TrackPlayer.reset();
      await TrackPlayer.add(tracks);
      setChapters(newChapters);
      await TrackPlayer.play();
    },
    [],
  );

  const togglePlay = useCallback(async () => {
    await ensurePlayer();
    setReady(true);
    if (playbackState.state === State.Playing) {
      await TrackPlayer.pause();
      return;
    }
    await TrackPlayer.play();
  }, [playbackState.state]);

  const next = useCallback(async () => {
    await ensurePlayer();
    setReady(true);
    try {
      await TrackPlayer.skipToNext();
    } catch {
      // At end of queue - ignore
    }
  }, []);

  const prev = useCallback(async () => {
    await ensurePlayer();
    setReady(true);
    try {
      await TrackPlayer.skipToPrevious();
    } catch {
      // At start of queue - ignore
    }
  }, []);

  const skipTo = useCallback(async (index: number) => {
    await ensurePlayer();
    setReady(true);
    await TrackPlayer.skip(index);
    await TrackPlayer.play();
  }, []);

  const seekTo = useCallback(async (seconds: number) => {
    await ensurePlayer();
    setReady(true);
    await TrackPlayer.seekTo(seconds);
  }, []);

  const value: PlayerContextValue = {
    chapters,
    currentIndex: currentIndex === -1 ? null : currentIndex,
    isPlaying,
    isLoading,
    hasError,
    position: progress.position,
    duration: progress.duration,
    playOccasion,
    togglePlay,
    next,
    prev,
    skipTo,
    seekTo,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}
