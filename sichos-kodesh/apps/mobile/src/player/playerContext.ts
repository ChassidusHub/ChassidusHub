import { createContext } from 'react';
import type { CatalogAudio } from '@sichos-kodesh/catalog';

/** What the player is currently loaded with - one occasion's recordings, in chapter order. Same shape the web's PlayerProvider takes. */
export interface PlayerPlaylist {
  title: string;
  audio: CatalogAudio[];
  hebrewYear: number;
  occasionId: number;
  hebrewDate: string;
}

export interface PlayerError {
  /** The failure looked like a network failure while offline - the bar shows the "not downloaded" wording instead of a generic error. */
  offline: boolean;
  message: string;
}

export interface PlayerContextValue {
  /** Null until something has been played this session (or restored from the last one) - the bar renders nothing until then. */
  playlist: PlayerPlaylist | null;
  currentIndex: number;
  playing: boolean;
  /** A fresh chapter, a skip, still buffering - the toggle shows a spinner instead of play/pause. */
  loading: boolean;
  /** Seconds. */
  currentTime: number;
  duration: number;
  error: PlayerError | null;
  /** Loads `playlist` and starts playing `chapterIndex` from `position` (seconds). */
  play: (playlist: PlayerPlaylist, chapterIndex?: number, position?: number) => void;
  togglePlay: () => void;
  /** Pauses without changing the playlist - the player bar's "put it away" gesture; the bar can come back to exactly this state. */
  pause: () => void;
  next: () => void;
  prev: () => void;
  /** Jumps to one chapter of the current playlist, resuming wherever it was left off. */
  playChapter: (index: number) => void;
  seekToFraction: (fraction: number) => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);
