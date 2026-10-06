import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, State, useActiveTrack, usePlaybackState, useProgress } from 'react-native-track-player';
import { DEFAULT_PLAYBACK_RATE, effectivePlaybackRate, isPlaybackRate, isPlaybackRateAllowed } from '@chassidushub-reader/catalog';
import type { PlaybackRate } from '@chassidushub-reader/catalog';
import { getCatalog } from '../catalog/catalogStore';
import { useLanguage } from '../i18n/useTranslation';
import type { Language } from '../i18n/translations';
import { getOnlineSnapshot, looksLikeNetworkError, reportFetchFailure } from '../network/connectivity';
import { catalogAudioToTracks, trackMetadata } from './playlist';
import type { PlayerContextValue, PlayerError, PlayerPlaylist } from './playerContext';
import { PlayerContext, playlistForEntry, playlistNames, SKIP_SECONDS } from './playerContext';
import {
  flushProgressStore,
  getLastPlaylist,
  getOccasionProgress,
  hydrateProgressStore,
  readProgressMap,
  recordChapterProgress,
  recordLastPlaylist,
} from './progressStore';

interface Props {
  children: ReactNode;
}

/**
 * How long after the active track changes a progress sample is distrusted
 * (useProgress polls every 500 ms, so a stale sample can survive a poll or
 * two), and the position below which a sample in that window is accepted
 * anyway - it can only be the new track's own start.
 */
const STALE_PROGRESS_WINDOW_MS = 1500;
const STALE_PROGRESS_START_SECONDS = 5;
/** The listener's preferred speed for the recordings that allow one (see playbackPolicy in packages/catalog) - same key semantics as the web's localStorage entry. */
const RATE_KEY = 'chassidushub:playback-rate';

// Promise sentinel: null = not started, in-flight promise = setting up, resolved = ready.
let playerSetupPromise: Promise<void> | null = null;

async function doSetup(): Promise<void> {
  await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
  await TrackPlayer.updateOptions({
    android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo, Capability.JumpBackward, Capability.JumpForward],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
    // The notification's 15 seconds back and forward, as in the full player (trackPlayerService.ts).
    backwardJumpInterval: SKIP_SECONDS,
    forwardJumpInterval: SKIP_SECONDS,
    progressUpdateEventInterval: 1,
  });
}

/** What the track names are made from: the playlist's recordings and both names of its occasion. */
function trackSource(playlist: PlayerPlaylist) {
  return { audio: playlist.audio, ...playlistNames(playlist) };
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

/**
 * The single, app-wide player (react-native-track-player underneath, so
 * playback continues in the background with lock-screen controls).
 * Mirrors the web PlayerProvider's context shape one-to-one - see
 * playerContext.ts - and records listening progress into progressStore the
 * same way, so Continue rows, finished markers and resume positions behave
 * identically on both apps. The last playlist is restored, paused, on the
 * next launch, the way the web player survives a reload.
 */
export function PlayerProvider({ children }: Props) {
  const [playlist, setPlaylist] = useState<PlayerPlaylist | null>(null);
  const [error, setError] = useState<PlayerError | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // The chapter a play/skip just asked for - reported as `currentIndex` until
  // the native player's own active track catches up, so the bar never flashes
  // the previous chapter (or chapter 0) while a switch is in flight.
  const [requestedIndex, setRequestedIndex] = useState<number | null>(null);
  const playlistRef = useRef<PlayerPlaylist | null>(null);
  const lastProgressBucketRef = useRef<string | null>(null);
  const restoredRef = useRef(false);
  // The track names the notification and lock screen show follow the UI
  // language: the queue is built in the current one, and renamed in place
  // when the language changes. `queueLanguageRef` is the language the
  // native queue's names are in - null while a new queue is being built,
  // 'unknown' for a queue adopted from before this launch.
  const { language } = useLanguage();
  const languageRef = useRef<Language>(language);
  const queueLanguageRef = useRef<Language | 'unknown' | null>(null);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    languageRef.current = language;
    const queueLanguage = queueLanguageRef.current;
    if (!playlist || queueLanguage === null || queueLanguage === language) return;
    queueLanguageRef.current = language;
    const source = trackSource(playlist);
    Promise.all(playlist.audio.map((audio, index) => TrackPlayer.updateMetadataForTrack(index, trackMetadata(source, audio, index, language)))).catch(() => undefined);
  }, [language, playlist]);

  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();

  const activeIndex = useMemo(() => {
    if (!playlist || activeTrack == null) return -1;
    return playlist.audio.findIndex((chapter) => chapter.workerFilename === String(activeTrack.id));
  }, [activeTrack, playlist]);

  // Once the native player reports the requested chapter as active, stop
  // overriding with the requested index.
  useEffect(() => {
    if (requestedIndex != null && activeIndex === requestedIndex) setRequestedIndex(null);
  }, [activeIndex, requestedIndex]);

  const currentIndex = requestedIndex ?? (activeIndex >= 0 ? activeIndex : 0);
  const playing = playbackState.state === State.Playing;
  const loading = actionLoading || playbackState.state === State.Loading || playbackState.state === State.Buffering;

  // The Rebbe's own recordings always play at 1x whatever the preference
  // says - the preference only ever reaches a shiur or a chazara (see
  // playbackPolicy in packages/catalog). The native player keeps one rate
  // across the queue, so it is re-applied whenever the chapter (and with
  // it the allowed rate) or the preference changes.
  const [preferredRate, setPreferredRate] = useState<PlaybackRate>(DEFAULT_PLAYBACK_RATE);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(RATE_KEY)
      .then((raw) => {
        const rate = Number(raw);
        if (!cancelled && raw != null && isPlaybackRate(rate)) setPreferredRate(rate);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const currentAudio = playlist?.audio[currentIndex] ?? null;
  const playbackRateAllowed = isPlaybackRateAllowed(currentAudio);
  const playbackRate = effectivePlaybackRate(currentAudio, preferredRate);
  useEffect(() => {
    if (!playlist) return;
    ensurePlayer()
      .then(() => TrackPlayer.setRate(playbackRate))
      .catch(() => undefined);
  }, [playbackRate, playlist]);

  const setPlaybackRate = useCallback((rate: PlaybackRate) => {
    setPreferredRate(rate);
    AsyncStorage.setItem(RATE_KEY, String(rate)).catch(() => undefined);
  }, []);

  const runPlayerAction = useCallback(async (action: () => Promise<void>) => {
    setActionLoading(true);
    setError(null);
    try {
      await ensurePlayer();
      await action();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const network = looksLikeNetworkError(message);
      if (network) reportFetchFailure();
      setError({ offline: network || !getOnlineSnapshot(), message });
    } finally {
      setActionLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sub = TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
      if (cancelled) return;
      const message = event.message || `Playback error (${event.code})`;
      const network = looksLikeNetworkError(message) || looksLikeNetworkError(event.code);
      if (network) reportFetchFailure();
      setError({ offline: network || !getOnlineSnapshot(), message });
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // Restore the last playlist, paused, into the bar on launch.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    (async () => {
      await hydrateProgressStore();
      const last = getLastPlaylist();
      if (!last || cancelled) return;
      const entry = getCatalog()[last.hebrewYear]?.find((item) => item.occasionId === last.occasionId);
      if (!entry || entry.audio.length === 0) return;
      const chapterIndex = Math.min(last.chapterIndex, entry.audio.length - 1);
      try {
        await ensurePlayer();
        const queue = await TrackPlayer.getQueue();
        if (cancelled) return;
        // The playback service can outlive the JS side (background playback,
        // a quick relaunch) - if it still holds a queue, adopt it instead of
        // resetting whatever is currently playing.
        if (queue.length === 0) {
          const trackLanguage = languageRef.current;
          await TrackPlayer.add(await catalogAudioToTracks(entry, trackLanguage));
          await TrackPlayer.skip(chapterIndex, last.position);
          queueLanguageRef.current = trackLanguage;
        } else {
          queueLanguageRef.current = 'unknown';
        }
        if (cancelled) return;
        setPlaylist(playlistForEntry(entry));
      } catch {
        // Player unavailable (a test environment, a broken audio stack) - the bar just stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const play = useCallback(
    (next: PlayerPlaylist, chapterIndex = 0, position = 0) => {
      if (next.audio.length === 0) return;
      const safeIndex = Math.max(0, Math.min(chapterIndex, next.audio.length - 1));
      queueLanguageRef.current = null;
      setPlaylist(next);
      setRequestedIndex(safeIndex);
      lastProgressBucketRef.current = null;
      recordLastPlaylist({ hebrewYear: next.hebrewYear, occasionId: next.occasionId, chapterIndex: safeIndex, position });
      runPlayerAction(async () => {
        const trackLanguage = languageRef.current;
        const tracks = await catalogAudioToTracks(trackSource(next), trackLanguage);
        await TrackPlayer.reset();
        await TrackPlayer.add(tracks);
        queueLanguageRef.current = trackLanguage;
        await TrackPlayer.skip(safeIndex, position > 0 ? position : undefined);
        await TrackPlayer.play();
      }).catch(() => undefined);
    },
    [runPlayerAction],
  );

  const togglePlay = useCallback(() => {
    if (!playlistRef.current) return;
    runPlayerAction(async () => {
      const { state } = await TrackPlayer.getPlaybackState();
      if (state === State.Playing) await TrackPlayer.pause();
      else await TrackPlayer.play();
    }).catch(() => undefined);
  }, [runPlayerAction]);

  const pause = useCallback(() => {
    if (!playlistRef.current) return;
    runPlayerAction(() => TrackPlayer.pause()).catch(() => undefined);
  }, [runPlayerAction]);

  const playChapter = useCallback(
    (index: number) => {
      const current = playlistRef.current;
      if (!current || index < 0 || index >= current.audio.length) return;
      const saved = getOccasionProgress(readProgressMap(), current.hebrewYear, current.occasionId)?.chapters[index]?.position ?? 0;
      setRequestedIndex(index);
      runPlayerAction(async () => {
        await TrackPlayer.skip(index, saved > 0 ? saved : undefined);
        await TrackPlayer.play();
      }).catch(() => undefined);
    },
    [runPlayerAction],
  );

  const next = useCallback(() => {
    const current = playlistRef.current;
    if (!current) return;
    const target = Math.min(currentIndex + 1, current.audio.length - 1);
    if (target === currentIndex) return;
    playChapter(target);
  }, [currentIndex, playChapter]);

  const prev = useCallback(() => {
    if (!playlistRef.current) return;
    const target = Math.max(currentIndex - 1, 0);
    if (target === currentIndex) return;
    playChapter(target);
  }, [currentIndex, playChapter]);

  const seekToFraction = useCallback(
    (fraction: number) => {
      const duration = progress.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const target = Math.max(0, Math.min(fraction, 1)) * duration;
      TrackPlayer.seekTo(target).catch(() => undefined);
    },
    [progress.duration],
  );

  const seekBy = useCallback((seconds: number) => {
    TrackPlayer.seekBy(seconds).catch(() => undefined);
  }, []);

  // useProgress polls every 500 ms while useActiveTrack updates on the
  // track-changed event, so for a poll or two after a skip the sample still
  // describes the *previous* chapter - and would credit its position to the
  // new one (a chapter never played showing a quarter listened). Samples in
  // that window are ignored unless they already sit near the start.
  const indexChangedAtRef = useRef(0);
  useEffect(() => {
    indexChangedAtRef.current = Date.now();
  }, [activeIndex]);

  // Throttled progress recording - once per 5-second bucket per chapter,
  // not on every tick (the same "periodic writes, not every event"
  // pattern the web PlayerProvider uses).
  useEffect(() => {
    if (!playlist || activeIndex < 0) return;
    const chapter = playlist.audio[activeIndex];
    if (!chapter) return;
    if (Date.now() - indexChangedAtRef.current < STALE_PROGRESS_WINDOW_MS && progress.position > STALE_PROGRESS_START_SECONDS) return;
    const duration = progress.duration > 0 ? progress.duration : chapter.durationMs / 1000;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const position = Math.max(0, Math.min(progress.position, duration));
    const bucket = `${playlist.hebrewYear}:${playlist.occasionId}:${activeIndex}:${Math.floor(position / 5)}`;
    if (bucket === lastProgressBucketRef.current) return;
    lastProgressBucketRef.current = bucket;
    recordChapterProgress(playlist.hebrewYear, playlist.occasionId, playlist.title, activeIndex, position, duration);
    recordLastPlaylist({ hebrewYear: playlist.hebrewYear, occasionId: playlist.occasionId, chapterIndex: activeIndex, position });
  }, [activeIndex, playlist, progress.duration, progress.position]);

  // A pending debounced write could otherwise be lost when Android suspends the app.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushProgressStore().catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      playlist,
      currentIndex,
      playing,
      loading,
      // While a switch is in flight the native progress still belongs to the
      // previous chapter; show the requested one from its own start instead.
      currentTime: requestedIndex != null ? 0 : progress.position,
      duration: requestedIndex != null ? (playlist?.audio[requestedIndex]?.durationMs ?? 0) / 1000 : progress.duration,
      error,
      play,
      togglePlay,
      pause,
      next,
      prev,
      playChapter,
      seekToFraction,
      seekBy,
      playbackRate,
      playbackRateAllowed,
      setPlaybackRate,
    }),
    [currentIndex, error, loading, next, pause, play, playChapter, playing, playlist, prev, progress.duration, progress.position, requestedIndex, seekBy, seekToFraction, togglePlay, playbackRate, playbackRateAllowed, setPlaybackRate],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
