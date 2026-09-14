import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { audioUrl } from '../download/download';
import { PlayerContext } from './playerContext';
import type { Playlist, PlayerContextValue, PlayerState } from './playerContext';

/**
 * Holds the single `<audio>` element for the whole app, mounted once here
 * (not per-screen) so playback survives navigating between screens - the
 * behavior every real player (Spotify, YouTube) has and a screen-scoped
 * player structurally can't: unmounting the element on navigation was
 * exactly why playback used to stop when leaving the PDF viewer. Provider
 * must be mounted above the router's `<Routes>`, never inside one.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<PlayerState>({ playlist: null, currentIndex: 0, playing: false, currentTime: 0, duration: 0 });

  const play = useCallback((playlist: Playlist, startIndex = 0) => {
    setState({ playlist, currentIndex: startIndex, playing: true, currentTime: 0, duration: 0 });
    // The actual .play() call happens in the effect below, once the <audio>
    // element's `src` has updated to match this new chapter.
  }, []);

  const playChapter = useCallback((index: number) => {
    setState((prev) => (prev.playlist ? { ...prev, currentIndex: index, playing: true, currentTime: 0, duration: 0 } : prev));
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (state.playing) el.pause();
    else void el.play();
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

  const current = state.playlist?.audio[state.currentIndex] ?? null;

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
      title: current.chapterName ?? state.playlist.title,
      artist: state.playlist.title,
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
          onPlay={() => setState((s) => ({ ...s, playing: true }))}
          onPause={() => setState((s) => ({ ...s, playing: false }))}
          onEnded={next}
          // Read from `e.currentTarget` before calling setState, not inside the
          // updater function - React (StrictMode especially) can invoke a state
          // updater more than once, by which point the synthetic event's
          // `currentTarget` has already been nulled out.
          onLoadedMetadata={(e) => {
            const duration = e.currentTarget.duration;
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
