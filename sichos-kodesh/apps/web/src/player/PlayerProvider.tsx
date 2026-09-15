import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { audioUrl } from '../download/download';
import { probeRealConnectivity } from '../network/useOnlineStatus';
import { forMediaSession } from '../utils/hebrewPunctuation';
import { recordChapterProgress } from './progressStore';
import { PlayerContext } from './playerContext';
import type { Playlist, PlayerContextValue, PlayerState } from './playerContext';

const PERSIST_KEY = 'sichos-kodesh:player-state';

interface PersistedPlayerState {
  playlist: Playlist;
  currentIndex: number;
  currentTime: number;
}

/** What survives a reload/re-enter (see PlayerProvider's doc comment) - never `playing`, since actual audio can't be resumed without a user gesture anyway, and never `duration`, which the restored `<audio>` element re-derives on its own first load. */
function readPersisted(): PersistedPlayerState | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPlayerState;
    if (!parsed.playlist || !Array.isArray(parsed.playlist.audio)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(next: PersistedPlayerState): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(next));
  } catch {
    // Best-effort persistence only.
  }
}

/**
 * Holds the single `<audio>` element for the whole app, mounted once here
 * (not per-screen) so playback survives navigating between screens - the
 * behavior every real player (Spotify, YouTube) has and a screen-scoped
 * player structurally can't: unmounting the element on navigation was
 * exactly why playback used to stop when leaving the PDF viewer. Provider
 * must be mounted above the router's `<Routes>`, never inside one.
 *
 * The playlist, chapter, and position also survive a full reload or
 * re-entering the site later (localStorage, not cookies - this is all
 * client-side state a server never needs to see), restored paused rather
 * than actually resumed: browsers block audio autoplay without a user
 * gesture, so the honest restore is "picking up where you left off, tap
 * play to continue" rather than pretending to autoplay and silently
 * failing.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [initialPersisted] = useState(readPersisted);
  const [state, setState] = useState<PlayerState>(() =>
    initialPersisted
      ? { playlist: initialPersisted.playlist, currentIndex: initialPersisted.currentIndex, playing: false, currentTime: initialPersisted.currentTime, duration: 0, error: null }
      : { playlist: null, currentIndex: 0, playing: false, currentTime: 0, duration: 0, error: null },
  );
  // Consumed once, by the first chapter's `onLoadedMetadata` below - not a
  // dependency of any effect, so it deliberately doesn't trigger re-renders.
  const pendingSeekRef = useRef<number | null>(initialPersisted && initialPersisted.currentTime > 0 ? initialPersisted.currentTime : null);

  const current = state.playlist?.audio[state.currentIndex] ?? null;

  const play = useCallback(
    (playlist: Playlist, startIndex = 0, startTime = 0) => {
      const targetChapter = playlist.audio[startIndex];
      // Only relevant when resuming a specific position (Continue section):
      // if the requested chapter is already the one loaded, the `<audio>`
      // element's `src` won't change, so the effect below (keyed on the
      // chapter's filename) won't refire to consume a pending seek - seek
      // directly instead.
      const alreadyLoaded = targetChapter && current?.workerFilename === targetChapter.workerFilename;
      if (alreadyLoaded && audioRef.current) {
        if (audioRef.current.error) {
          // Retrying the exact chapter that just failed to load (e.g.
          // tapping the same row again after coming back online) - a bare
          // `.play()` on an element already in its errored network state
          // won't retry the fetch at all (the `src` hasn't changed, so
          // there's no new resource-selection attempt to hook onError back
          // onto), silently doing nothing. `.load()` forces a real retry.
          pendingSeekRef.current = startTime > 0 ? startTime : null;
          audioRef.current.load();
        } else {
          audioRef.current.currentTime = startTime;
        }
        void audioRef.current.play();
      } else {
        pendingSeekRef.current = startTime > 0 ? startTime : null;
      }
      setState({ playlist, currentIndex: startIndex, playing: true, currentTime: startTime, duration: 0, error: null });
      // Otherwise the actual .play() call happens in the effect below, once
      // the <audio> element's `src` has updated to match this new chapter.
    },
    [current],
  );

  const playChapter = useCallback((index: number) => {
    setState((prev) => (prev.playlist ? { ...prev, currentIndex: index, playing: true, currentTime: 0, duration: 0 } : prev));
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (state.playing) el.pause();
    else {
      if (el.error) el.load(); // see the matching comment in `play` above
      void el.play();
    }
  }, [state.playing]);

  const next = useCallback(() => {
    setState((prev) => {
      if (!prev.playlist || prev.currentIndex >= prev.playlist.audio.length - 1) return prev;
      return { ...prev, currentIndex: prev.currentIndex + 1, playing: true, currentTime: 0, duration: 0 };
    });
  }, []);

  const prev = useCallback(() => {
    setState((prevState) => {
      if (!prevState.playlist || prevState.currentIndex <= 0) return prevState;
      return { ...prevState, currentIndex: prevState.currentIndex - 1, playing: true, currentTime: 0, duration: 0 };
    });
  }, []);

  const seekToFraction = useCallback((fraction: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration === 0) return;
    el.currentTime = fraction * el.duration;
  }, []);

  // Persisted immediately on a playlist/chapter change (rare, worth never
  // losing) and throttled on plain playback-position ticks (frequent -
  // `onTimeUpdate` fires several times a second) so a reload resumes
  // within a few seconds of the real position without hammering
  // localStorage on every tick.
  const lastPersistRef = useRef(0);
  useEffect(() => {
    if (!state.playlist) return;
    lastPersistRef.current = Date.now();
    writePersisted({ playlist: state.playlist, currentIndex: state.currentIndex, currentTime: state.currentTime });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately excludes currentTime, handled by the throttled effect below
  }, [state.playlist, state.currentIndex]);

  useEffect(() => {
    if (!state.playlist) return;
    const now = Date.now();
    if (now - lastPersistRef.current < 3000) return;
    lastPersistRef.current = now;
    writePersisted({ playlist: state.playlist, currentIndex: state.currentIndex, currentTime: state.currentTime });
  }, [state.playlist, state.currentIndex, state.currentTime]);

  // A throttled tick can lose the last couple of seconds of position if the
  // tab is closed/backgrounded between writes - flush immediately whenever
  // the page might be going away, so "re-enter the site" resumes accurately
  // even right after a fresh seek.
  useEffect(() => {
    function flush() {
      if (state.playlist) writePersisted({ playlist: state.playlist, currentIndex: state.currentIndex, currentTime: state.currentTime });
    }
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [state.playlist, state.currentIndex, state.currentTime]);

  // Per-chapter listening progress for the home page's Continue section
  // (see player/progressStore.ts) - same throttling rationale as the
  // position persistence above, just a separate localStorage key/schema.
  const lastProgressRecordRef = useRef(0);
  useEffect(() => {
    if (!state.playlist || state.duration <= 0) return;
    const now = Date.now();
    if (now - lastProgressRecordRef.current < 3000) return;
    lastProgressRecordRef.current = now;
    recordChapterProgress(state.playlist.hebrewYear, state.playlist.occasionId, state.playlist.title, state.currentIndex, state.currentTime, state.duration);
  }, [state.playlist, state.currentIndex, state.currentTime, state.duration]);

  // Toggling the `autoPlay` prop on an already-mounted <audio> element does
  // not reliably (re)start playback across browsers once its `src` has
  // changed - only an explicit `.play()` call does, so chapter/playlist
  // changes are driven from here rather than from the `autoPlay` attribute.
  useEffect(() => {
    if (state.playing) void audioRef.current?.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the chapter, not `state.playing` (togglePlay drives that directly on the element)
  }, [current?.workerFilename]);

  // The Media Session API is what puts a real title/chapter and working
  // prev/next/play/pause on Android's lock-screen and notification-shade
  // media controls (and macOS/Windows/iOS equivalents) instead of a bare
  // "playing audio from <site>" entry with no controls - a real, visible
  // difference on the platform this is a PWA for, not a cosmetic extra.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!state.playlist || !current) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: forMediaSession(current.chapterName ?? state.playlist.title),
      artist: forMediaSession(state.playlist.title),
      album: 'Sichos Kodesh',
      artwork: [
        { src: `${import.meta.env.BASE_URL}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${import.meta.env.BASE_URL}icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    });
  }, [state.playlist, current]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
  }, [state.playing]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (audioRef.current && details.seekTime != null) audioRef.current.currentTime = details.seekTime;
    });
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [prev, next]);

  const value = useMemo<PlayerContextValue>(
    () => ({ ...state, play, togglePlay, playChapter, next, prev, seekToFraction, audioRef }),
    [state, play, togglePlay, playChapter, next, prev, seekToFraction],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {current && (
        <audio
          ref={audioRef}
          src={audioUrl(current.workerFilename)}
          // Without this, a cross-origin <audio src> (services/media-proxy is
          // a different origin) requests in "no-cors" mode by default - the
          // service worker's CacheFirst route (vite.config.ts) still
          // intercepts and caches it, but the cached response comes back
          // "opaque": an unreadable, 0-byte body, permanently, for that URL
          // (confirmed directly - see vite.config.ts's cacheableResponse
          // comment). That first cached opaque entry then serves as "the"
          // cached response for every future request to the same URL,
          // including this element's own real range-sliced reads, breaking
          // playback outright - a real reported bug that shows up
          // specifically once the service worker starts controlling the
          // page (a reload, not the very first uncontrolled visit), matching
          // "recordings don't load... after reload." `anonymous` (not
          // `use-credentials`) matches the Worker's own `Access-Control-
          // Allow-Origin: *` - no cookies/auth involved.
          crossOrigin="anonymous"
          onPlay={() => setState((s) => ({ ...s, playing: true, error: null }))}
          onPause={() => setState((s) => ({ ...s, playing: false }))}
          // No `onError` handler existed here at all before - a chapter
          // failing to load (the common case: offline and not downloaded)
          // silently did nothing visible, unlike PdfViewerScreen's own
          // offline handling (a real reported gap: "never get the offline
          // message" when testing with a recording, not a PDF). A raw
          // `navigator.onLine` read is known to be unreliable (see
          // PdfViewerScreen's matching comment) - a real network probe,
          // right now, is what actually decides which message to show.
          onError={async () => {
            const online = await probeRealConnectivity();
            setState((s) => ({ ...s, playing: false, error: { offline: !online } }));
          }}
          onEnded={() => {
            // Record this chapter as fully played explicitly - the last
            // throttled onTimeUpdate tick before "ended" fires can still
            // be a few seconds short of the real duration, which would
            // otherwise leave a just-finished chapter just under the
            // finished threshold.
            if (state.playlist && state.duration > 0) {
              recordChapterProgress(state.playlist.hebrewYear, state.playlist.occasionId, state.playlist.title, state.currentIndex, state.duration, state.duration);
            }
            next();
          }}
          // Read from `e.currentTarget` before calling setState, not inside the
          // updater function - React (StrictMode especially) can invoke a state
          // updater more than once, by which point the synthetic event's
          // `currentTarget` has already been nulled out.
          onLoadedMetadata={(e) => {
            const duration = e.currentTarget.duration;
            // One-shot: only the very first chapter loaded after a restore
            // has a pending position to resume from - every ordinary
            // chapter change already starts its `currentTime` at 0.
            if (pendingSeekRef.current != null) {
              e.currentTarget.currentTime = pendingSeekRef.current;
              pendingSeekRef.current = null;
            }
            setState((s) => ({ ...s, duration }));
          }}
          onTimeUpdate={(e) => {
            const currentTime = e.currentTarget.currentTime;
            setState((s) => ({ ...s, currentTime }));
          }}
          style={{ display: 'none' }}
        />
      )}
    </PlayerContext.Provider>
  );
}
