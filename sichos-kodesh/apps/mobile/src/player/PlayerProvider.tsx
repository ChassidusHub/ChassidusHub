import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  recordOccasionAudioProgress,
  resolveResumeAudioChapter,
} from '@sichos-kodesh/app-core';
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
import {
  getOccasionProgress,
  occasionProgressKey,
  readPlayerProgressStore,
  writePlayerProgressStore,
} from './progressPersistence';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const setupDoneRef = useRef(false);
  const progressStoreRef = useRef<Awaited<ReturnType<typeof readPlayerProgressStore>>>({
    version: 1,
    occasions: {},
    lastQueue: null,
  });
  const progressHydrationPromiseRef = useRef<Promise<void> | null>(null);
  const progressWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressBucketRef = useRef<string | null>(null);

  useEffect(() => {
    if (setupDoneRef.current) return;
    setupDoneRef.current = true;
    progressHydrationPromiseRef.current = readPlayerProgressStore()
      .then((store) => {
        progressStoreRef.current = store;
      })
      .catch(() => undefined);
    ensurePlayer()
      .then(() => setReady(true))
      .catch(() => {
        // Non-fatal: player unavailable (e.g., simulator/test env)
        setReady(false);
        setHasError(true);
        setErrorMessage('Audio player setup failed');
      });
  }, []);

  const scheduleProgressWrite = useCallback(() => {
    if (progressWriteTimerRef.current) return;
    progressWriteTimerRef.current = setTimeout(() => {
      progressWriteTimerRef.current = null;
      writePlayerProgressStore(progressStoreRef.current).catch(() => undefined);
    }, 1500);
  }, []);

  useEffect(
    () => () => {
      if (progressWriteTimerRef.current) {
        clearTimeout(progressWriteTimerRef.current);
        progressWriteTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!ready) return;
    const sub = TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
      setHasError(true);
      setErrorMessage(event.message || `Playback error (${event.code})`);
    });
    return () => sub.remove();
  }, [ready]);

  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();

  const isPlaying = playbackState.state === State.Playing;
  const isLoading =
    actionLoading ||
    playbackState.state === State.Loading ||
    playbackState.state === State.Buffering;

  const currentIndex =
    activeTrack != null
      ? chapters.findIndex((chapter) => chapter.workerFilename === String(activeTrack.id))
      : null;

  const runPlayerAction = useCallback(
    async (action: () => Promise<void>) => {
      setActionLoading(true);
      setHasError(false);
      setErrorMessage(null);
      try {
        await action();
      } catch (error) {
        setHasError(true);
        setErrorMessage(
          error instanceof Error ? error.message : 'Playback operation failed',
        );
        throw error;
      } finally {
        setActionLoading(false);
      }
    },
    [],
  );

  const playOccasion = useCallback(
    async (entry: CatalogEntry) => {
      if (!entry.audio.length) return;
      await runPlayerAction(async () => {
        await ensurePlayer();
        setReady(true);
        if (progressHydrationPromiseRef.current) {
          await progressHydrationPromiseRef.current;
        }
        const tracks = await catalogAudioToTracks(entry);
        const newChapters = entry.audio.map((audio) =>
          catalogAudioToChapter(entry, audio),
        );
        const stored = getOccasionProgress(progressStoreRef.current, entry);
        const resume = resolveResumeAudioChapter(stored, entry);

        await TrackPlayer.reset();
        await TrackPlayer.add(tracks);
        setChapters(newChapters);
        if (resume.chapterIndex > 0) {
          await TrackPlayer.skip(resume.chapterIndex);
        }
        if (resume.position > 0) {
          await TrackPlayer.seekTo(resume.position);
        }
        await TrackPlayer.play();
      });
    },
    [runPlayerAction],
  );

  const togglePlay = useCallback(async () => {
    await runPlayerAction(async () => {
      await ensurePlayer();
      setReady(true);
      if (playbackState.state === State.Playing) {
        await TrackPlayer.pause();
        return;
      }
      await TrackPlayer.play();
    });
  }, [playbackState.state, runPlayerAction]);

  const next = useCallback(async () => {
    await runPlayerAction(async () => {
      await ensurePlayer();
      setReady(true);
      try {
        await TrackPlayer.skipToNext();
      } catch {
        // At end of queue - ignore.
      }
    });
  }, [runPlayerAction]);

  const prev = useCallback(async () => {
    await runPlayerAction(async () => {
      await ensurePlayer();
      setReady(true);
      try {
        await TrackPlayer.skipToPrevious();
      } catch {
        // At start of queue - ignore.
      }
    });
  }, [runPlayerAction]);

  const skipTo = useCallback(async (index: number) => {
    await runPlayerAction(async () => {
      await ensurePlayer();
      setReady(true);
      await TrackPlayer.skip(index);
      await TrackPlayer.play();
    });
  }, [runPlayerAction]);

  const seekTo = useCallback(async (seconds: number) => {
    await runPlayerAction(async () => {
      await ensurePlayer();
      setReady(true);
      await TrackPlayer.seekTo(seconds);
    });
  }, [runPlayerAction]);

  useEffect(() => {
    if (currentIndex == null) return;
    const chapter = chapters[currentIndex];
    const audioId = chapter?.workerFilename;
    if (!chapter || !audioId) return;
    const duration = progress.duration > 0 ? progress.duration : chapter.durationMs / 1000;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const boundedPosition = Math.max(0, Math.min(progress.position, duration));
    const bucketKey = `${chapter.hebrewYear}:${chapter.occasionId}:${audioId}:${Math.floor(
      boundedPosition / 5,
    )}`;
    if (bucketKey === lastProgressBucketRef.current) return;
    lastProgressBucketRef.current = bucketKey;

    const occasionKey = occasionProgressKey(chapter.hebrewYear, chapter.occasionId);
    const existing = progressStoreRef.current.occasions[occasionKey];
    const updated = recordOccasionAudioProgress(existing, {
      hebrewYear: chapter.hebrewYear,
      occasionId: chapter.occasionId,
      occasionLabel: chapter.occasionLabel,
      audioId,
      position: boundedPosition,
      duration,
      markAsActive: true,
    });
    progressStoreRef.current = {
      ...progressStoreRef.current,
      occasions: {
        ...progressStoreRef.current.occasions,
        [occasionKey]: updated,
      },
      lastQueue: {
        hebrewYear: chapter.hebrewYear,
        occasionId: chapter.occasionId,
        currentAudioId: audioId,
        position: boundedPosition,
        savedAt: Date.now(),
      },
    };
    scheduleProgressWrite();
  }, [chapters, currentIndex, progress.duration, progress.position, scheduleProgressWrite]);

  const value: PlayerContextValue = {
    chapters,
    currentIndex: currentIndex === -1 ? null : currentIndex,
    isPlaying,
    isLoading,
    hasError,
    errorMessage,
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
