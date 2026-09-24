import { createContext } from 'react';
import { occasionTitle } from '@sichos-kodesh/app-core';
import type { Language } from '@sichos-kodesh/app-core';
import type { CatalogAudio, CatalogEntry, PlaybackRate } from '@sichos-kodesh/catalog';

/** What the player is currently loaded with - one occasion's recordings, in chapter order. Same shape the web's PlayerProvider takes. */
export interface PlayerPlaylist {
  /**
   * The occasion's own Hebrew label (`occasionLabel`) - what saved progress
   * is recorded under and what "is this playlist the one playing" compares.
   * Shown through `playlistTitle`, never directly.
   */
  title: string;
  /** The occasion's English name (`occasionLabelEn`), for the English UI - absent where it has none. */
  titleEn?: string;
  audio: CatalogAudio[];
  hebrewYear: number;
  occasionId: number;
  hebrewDate: string;
}

/** An occasion's recordings as a playlist - every screen that plays one builds it here. */
export function playlistForEntry(entry: CatalogEntry): PlayerPlaylist {
  return {
    title: entry.occasionLabel,
    ...(entry.occasionLabelEn && { titleEn: entry.occasionLabelEn }),
    audio: entry.audio,
    hebrewYear: entry.hebrewYear,
    occasionId: entry.occasionId,
    hebrewDate: entry.hebrewDate,
  };
}

/** The playlist's occasion name in the UI language (see `occasionTitle`). */
export function playlistTitle(playlist: PlayerPlaylist, language: Language): string {
  return occasionTitle({ occasionLabel: playlist.title, occasionLabelEn: playlist.titleEn }, language);
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
  /** The rate audio actually plays at right now - always 1 for the Rebbe's own recordings, whatever the listener chose (see packages/catalog's playbackPolicy). */
  playbackRate: PlaybackRate;
  /** Whether the current chapter is one a listener may speed up or slow down (a shiur or a chazara) - the bar shows its speed control only then. */
  playbackRateAllowed: boolean;
  /** The listener's preferred rate, remembered across launches and applied wherever it is allowed. */
  setPlaybackRate: (rate: PlaybackRate) => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);
