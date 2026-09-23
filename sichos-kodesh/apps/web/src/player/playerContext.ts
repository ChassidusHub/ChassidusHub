import { createContext } from 'react';
import type { CatalogAudio, PlaybackRate } from '@sichos-kodesh/catalog';

export interface Playlist {
  /** What the player bar shows as context for what's playing - an occasion's label. */
  title: string;
  audio: CatalogAudio[];
  /** The occasion this playlist belongs to - lets PlayerProvider record per-chapter listening progress against it (see player/progressStore.ts) for the home page's Continue section. */
  hebrewYear: number;
  occasionId: number;
  /** The occasion's own raw mafteiach-index date key (e.g. "5736-06A-06") - shown alongside the title (see `hebrewFullDateLabel`) since the player bar and OS media session are never scoped to one source year the way an occasion's own page is, so the occasion label alone doesn't say which year's occurrence is actually playing. */
  hebrewDate: string;
}

export interface PlayerState {
  playlist: Playlist | null;
  currentIndex: number;
  playing: boolean;
  /** True from the moment play is requested (a fresh chapter, a skip, or resuming) until audio is actually audible - the real, user-visible "buffering" state neither the browser nor the OS media session otherwise exposes. See PlayerProvider's `onWaiting`/`onPlaying` handlers. */
  loading: boolean;
  currentTime: number;
  duration: number;
  /** Set when the current chapter's `<audio>` element failed to load (e.g. offline and not downloaded) - cleared as soon as playback actually starts. */
  error: { offline: boolean } | null;
}

export interface PlayerContextValue extends PlayerState {
  /** Loads a new playlist and starts playing from `startIndex`, optionally seeking to `startTime` seconds into that chapter (the home page's Continue section resuming a chapter that was stopped mid-way) - replaces whatever was playing before, matching a real player (not mixed/queued). */
  play: (playlist: Playlist, startIndex?: number, startTime?: number) => void;
  togglePlay: () => void;
  /** Pauses without changing the playlist - the player bar's "put it away" gesture; the bar can come back to exactly this state. */
  pause: () => void;
  playChapter: (index: number) => void;
  next: () => void;
  prev: () => void;
  seekToFraction: (fraction: number) => void;
  /** The rate audio actually plays at right now - always 1 for the Rebbe's own recordings, whatever the listener chose (see packages/catalog's playbackPolicy). */
  playbackRate: PlaybackRate;
  /** Whether the current chapter is one a listener may speed up or slow down (a shiur or a chazara) - the bar shows its speed control only then. */
  playbackRateAllowed: boolean;
  /** The listener's preferred rate, remembered across sessions and applied wherever it is allowed. */
  setPlaybackRate: (rate: PlaybackRate) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);
