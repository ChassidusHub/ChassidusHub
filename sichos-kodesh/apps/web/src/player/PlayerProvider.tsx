import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { audioUrl } from '../download/download';
import { getOnlineSnapshot, reportFetchFailure } from '../network/connectivity';
import { forMediaSession } from '../utils/hebrewPunctuation';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';
import { useLanguage } from '../i18n/useLanguage';
import { recordChapterProgress } from './progressStore';
import { PlayerContext } from './playerContext';
import type { Playlist, PlayerContextValue, PlayerState } from './playerContext';

const PERSIST_KEY = 'sichos-kodesh:player-state';

/** `HTMLMediaElement.readyState`'s lowest value: nothing has loaded for the current resource yet - see the `isSwitchingRef`/`onPause` comments in PlayerProvider for why this matters. */
const HAVE_NOTHING = 0;

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
    // `hebrewDate` is a newer field than this persistence schema itself -
    // a value saved before it existed would otherwise come back with it
    // `undefined`, breaking the date shown alongside the restored
    // playlist's title rather than just showing an absent one. Discarding
    // and falling back to "nothing playing" (same as no saved state at
    // all) is a one-time cost for whoever has an old save, not a
    // persistent bug.
    if (!parsed.playlist || !Array.isArray(parsed.playlist.audio) || typeof parsed.playlist.hebrewDate !== 'string') return null;
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
 * player structurally can't, since unmounting the element on navigation
 * would stop playback outright. Provider must be mounted above the
 * router's `<Routes>`, never inside one.
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
  const { language } = useLanguage();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [initialPersisted] = useState(readPersisted);
  const [state, setState] = useState<PlayerState>(() =>
    initialPersisted
      ? { playlist: initialPersisted.playlist, currentIndex: initialPersisted.currentIndex, playing: false, loading: false, currentTime: initialPersisted.currentTime, duration: 0, error: null }
      : { playlist: null, currentIndex: 0, playing: false, loading: false, currentTime: 0, duration: 0, error: null },
  );
  // Consumed once, by the first chapter's `onLoadedMetadata` below - not a
  // dependency of any effect, so it deliberately doesn't trigger re-renders.
  const pendingSeekRef = useRef<number | null>(initialPersisted && initialPersisted.currentTime > 0 ? initialPersisted.currentTime : null);
  // True for the brief window between changing the `<audio>` element's
  // `src` (a skip, a fresh chapter) and the effect below actually calling
  // `.play()` on it - see the matching comment on `onPause` for why this
  // exists: changing `src` on a *playing* element makes the browser itself
  // fire a real native 'pause' event as part of resetting the element for
  // the new resource (readyState back to HAVE_NOTHING, `paused` set to
  // true) - completely separate from anything the user or this app asked
  // for, but indistinguishable from a real pause to a plain `onPause`
  // handler. Without ignoring it, every skip/auto-advance visibly flickers
  // the whole player (and the OS lock-screen control, which mirrors
  // `state.playing`) to "stopped" and back the moment the new chapter's
  // first real `play` event arrives - the exact "stops, then reopens"
  // behavior reported.
  const isSwitchingRef = useRef(false);
  // Exactly one silent retry per chapter load before a real failure is
  // reported - see the matching comment on `onError` below.
  const retriedRef = useRef(false);

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
        isSwitchingRef.current = true;
        pendingSeekRef.current = startTime > 0 ? startTime : null;
      }
      retriedRef.current = false;
      setState({ playlist, currentIndex: startIndex, playing: true, loading: true, currentTime: startTime, duration: 0, error: null });
      // Otherwise the actual .play() call happens in the effect below, once
      // the <audio> element's `src` has updated to match this new chapter.
    },
    [current],
  );

  const playChapter = useCallback((index: number) => {
    isSwitchingRef.current = true;
    retriedRef.current = false;
    // A resume seek requested for whichever chapter was loading before this
    // one is now meaningless (this chapter starts at 0) - left set, it would
    // wrongly apply to *this* chapter's `onLoadedMetadata` instead once that
    // fires, snapping playback back to the old chapter's position the
    // moment loading finishes. See the matching comment on `pendingSeekRef`.
    pendingSeekRef.current = null;
    setState((prev) => (prev.playlist ? { ...prev, currentIndex: index, playing: true, loading: true, currentTime: 0, duration: 0 } : prev));
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (state.playing) el.pause();
    else {
      if (el.error) {
        retriedRef.current = false;
        el.load(); // see the matching comment in `play` above
      }
      setState((s) => ({ ...s, loading: true }));
      void el.play();
    }
  }, [state.playing]);

  const next = useCallback(() => {
    setState((prev) => {
      if (!prev.playlist || prev.currentIndex >= prev.playlist.audio.length - 1) return prev;
      isSwitchingRef.current = true;
      retriedRef.current = false;
      // See the matching comment in `playChapter` - a skip away from a
      // chapter that hasn't finished loading yet (so hasn't consumed its
      // own pending seek) must not let that stale position apply to
      // whatever loads next.
      pendingSeekRef.current = null;
      return { ...prev, currentIndex: prev.currentIndex + 1, playing: true, loading: true, currentTime: 0, duration: 0 };
    });
  }, []);

  const prev = useCallback(() => {
    setState((prevState) => {
      if (!prevState.playlist || prevState.currentIndex <= 0) return prevState;
      isSwitchingRef.current = true;
      retriedRef.current = false;
      pendingSeekRef.current = null;
      return { ...prevState, currentIndex: prevState.currentIndex - 1, playing: true, loading: true, currentTime: 0, duration: 0 };
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
    // The `<audio src>` DOM update that triggered this effect (React
    // commits it before running effects) is what fires the browser's own
    // implicit 'pause' - by now that's either already happened or is
    // about to via a queued task; either way `onPause`'s readyState check
    // is the real backstop, this is just the earliest reasonable point to
    // stop treating a *later* pause as expected.
    isSwitchingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the chapter, not `state.playing` (togglePlay drives that directly on the element)
  }, [current?.workerFilename]);

  // Coming back to the app after it was backgrounded is exactly when the
  // `onError` handler's one silent retry (see its own comment) is most
  // likely to already have run and failed - a background-induced network
  // abort and a user actually looking back at the app tend to happen
  // together. Retrying again right on return, before the user has to tap
  // anything, turns "I looked back and it's showing a scary error" into
  // "it just quietly picked back up," matching what a real native player
  // does.
  useEffect(() => {
    function retryOnForeground() {
      if (document.visibilityState !== 'visible' || !state.error) return;
      const el = audioRef.current;
      if (!el) return;
      retriedRef.current = false;
      setState((s) => ({ ...s, loading: true, error: null }));
      el.load();
      void el.play();
    }
    document.addEventListener('visibilitychange', retryOnForeground);
    return () => document.removeEventListener('visibilitychange', retryOnForeground);
  }, [state.error]);

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
    // The occasion's own date, alongside its label - unlike an occasion's
    // own page (scoped to one source year already, so its own date
    // display leaves the year out), this description is the only context
    // the lock-screen/notification gets for *which* year's occurrence of
    // a recurring occasion is actually playing.
    const dateLabel = hebrewFullDateLabel(state.playlist.hebrewDate, state.playlist.hebrewYear, language);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: forMediaSession(current.chapterName ?? state.playlist.title),
      artist: forMediaSession(`${state.playlist.title} · ${dateLabel}`),
      album: 'Sichos Kodesh',
      artwork: [
        { src: `${import.meta.env.BASE_URL}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${import.meta.env.BASE_URL}icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    });
  }, [state.playlist, current, language]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
  }, [state.playing]);

  // The Media Session position API is what actually drives the OS's own
  // lock-screen/notification seek bar and elapsed-time display - without
  // it, that control has no real position data at all, which is the
  // "bugged out" state a skip/fresh load can otherwise show: metadata (the
  // title) already updated to the new chapter, but with no matching
  // position reported yet. `duration <= 0` (right after a skip or on first
  // load, before `onLoadedMetadata` fires) explicitly clears the previously
  // reported state instead of reporting one - a stale one would leave the
  // *previous* chapter's duration/position shown against the new title, an
  // actually-mismatched, "bugged" state, not just an absent one. Called on
  // every position tick with no throttling, same as the API is meant to be
  // used (MDN's own example does the same, in exactly this handler).
  useEffect(() => {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
    if (!current || state.duration <= 0) {
      navigator.mediaSession.setPositionState();
      return;
    }
    try {
      navigator.mediaSession.setPositionState({ duration: state.duration, playbackRate: 1, position: Math.min(state.currentTime, state.duration) });
    } catch {
      // A rare floating-point case right at a chapter's end (position
      // marginally over duration) throws rather than clamping - safe to
      // skip that one update and pick it back up on the next tick.
    }
  }, [current, state.duration, state.currentTime]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => {
      setState((s) => ({ ...s, loading: true }));
      void audioRef.current?.play();
    });
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
          // (see vite.config.ts's cacheableResponse comment). That first
          // cached opaque entry then serves as "the" cached response for
          // every future request to the same URL, including this element's
          // own real range-sliced reads, breaking playback outright once
          // the service worker starts controlling the page (a reload, not
          // the very first uncontrolled visit). `anonymous` (not
          // `use-credentials`) matches the Worker's own `Access-Control-
          // Allow-Origin: *` - no cookies/auth involved.
          crossOrigin="anonymous"
          onPlay={() => setState((s) => ({ ...s, playing: true, error: null }))}
          // Ignores the browser's own implicit pause fired as a side effect
          // of this element's `src` changing mid-playback (see
          // `isSwitchingRef`'s own comment) - `readyState === HAVE_NOTHING`
          // is the timing-independent tell: that combination can only ever
          // be this implicit reset, never a real pause of media that was
          // actually playing (which requires having loaded *something*
          // first).
          onPause={(e) => {
            if (isSwitchingRef.current || e.currentTarget.readyState === HAVE_NOTHING) return;
            setState((s) => ({ ...s, playing: false, loading: false }));
          }}
          // The real "audio is actually audible now" signal - distinct
          // from `onPlay` above, which fires as soon as a `.play()` call is
          // merely *accepted*, before any data has necessarily loaded.
          // This is what actually clears the loading spinner.
          onPlaying={() => setState((s) => ({ ...s, loading: false }))}
          // Fires when playback has to stop because there isn't enough
          // buffered data yet - both for the initial load before a chapter
          // has ever played, and for a genuine mid-stream stall on a slow
          // connection. The one real, standard signal this app's own UI
          // and (indirectly, by keeping `playing` from ever having to
          // flip) the OS lock-screen control need to show "still loading"
          // instead of looking broken or unresponsive.
          onWaiting={() => setState((s) => ({ ...s, loading: true }))}
          // A chapter failing to load (the common case: offline and not
          // downloaded) needs a visible response here, matching
          // PdfViewerScreen's own offline handling. Retries exactly once
          // before concluding that, though: backgrounding the whole
          // browser (not just this tab) while a chapter is still loading
          // can make the OS reclaim the in-flight network connection out
          // from under it - a real, confirmed behavior on both Android and
          // iOS that has nothing to do with actual connectivity, but looks
          // identical to a real failure from this element's own
          // perspective. The element's own `MediaError.code` is checked
          // only once the retry has also failed, to decide which message
          // is actually true - claiming "offline" while genuinely
          // connected (a real 404, an unsupported format) is its own
          // confusing bug, distinct from the flicker this retry is really
          // for. This mirrors PdfViewerScreen's own `looksLikeNetworkError`
          // check: a raw `navigator.onLine` read is unreliable (see
          // connectivity.ts's doc comment) and, gating `reportFetchFailure`
          // on it directly, used to mean a chapter failing to load while
          // genuinely offline (Worker unreachable, OS still reporting a
          // live network interface) never told the rest of the app it was
          // offline at all - only PdfViewerScreen's own errors did.
          onError={(e) => {
            if (!retriedRef.current) {
              retriedRef.current = true;
              setState((s) => ({ ...s, loading: true }));
              e.currentTarget.load();
              void e.currentTarget.play();
              return;
            }
            if (e.currentTarget.error?.code === MediaError.MEDIA_ERR_NETWORK) reportFetchFailure();
            setState((s) => ({ ...s, playing: false, loading: false, error: { offline: !getOnlineSnapshot() } }));
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
