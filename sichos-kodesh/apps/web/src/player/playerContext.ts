import { createContext } from 'react';
import type { CatalogAudio } from '@sichos-kodesh/catalog';

export interface Playlist {
  /** What the player bar shows as context for what's playing - an occasion's label. */
  title: string;
  audio: CatalogAudio[];
  /** The occasion this playlist belongs to - lets PlayerProvider record per-chapter listening progress against it (see player/progressStore.ts) for the home page's Continue section. */
  hebrewYear: number;
  occasionId: number;
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
  playChapter: (index: number) => void;
  next: () => void;
  prev: () => void;
  seekToFraction: (fraction: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);
