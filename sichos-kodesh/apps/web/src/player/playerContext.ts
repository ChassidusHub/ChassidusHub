import { createContext } from 'react';
import type { CatalogAudio } from '@sichos-kodesh/catalog';

export interface Playlist {
  /** What the player bar shows as context for what's playing - an occasion's label. */
  title: string;
  audio: CatalogAudio[];
}

export interface PlayerState {
  playlist: Playlist | null;
  currentIndex: number;
  playing: boolean;
  currentTime: number;
  duration: number;
}

export interface PlayerContextValue extends PlayerState {
  /** Loads a new playlist and starts playing from `startIndex` - replaces whatever was playing before, matching a real player (not mixed/queued). */
  play: (playlist: Playlist, startIndex?: number) => void;
  togglePlay: () => void;
  playChapter: (index: number) => void;
  next: () => void;
  prev: () => void;
  seekToFraction: (fraction: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);
