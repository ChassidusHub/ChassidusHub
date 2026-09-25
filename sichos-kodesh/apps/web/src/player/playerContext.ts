import { createContext } from 'react';
import { occasionTitle } from '@sichos-kodesh/app-core';
import type { Language } from '@sichos-kodesh/app-core';
import type { CatalogAudio, CatalogEntry, PlaybackRate } from '@sichos-kodesh/catalog';

export interface Playlist {
  /**
   * The occasion's own Hebrew label (`occasionLabel`) - what saved progress
   * is recorded under and what "is this playlist the one playing" compares.
   * Shown through `playlistTitle`, never directly.
   */
  title: string;
  /** The occasion's English name (`occasionLabelEn`), for the English UI - absent where it has none, and in a playlist saved before it existed. */
  titleEn?: string;
  /** The short forms of both, for the player's title where the name is long (catalog 1.7.0). */
  titleShort?: string;
  titleShortEn?: string;
  audio: CatalogAudio[];
  /** The occasion this playlist belongs to - lets PlayerProvider record per-chapter listening progress against it (see player/progressStore.ts) for the home page's Continue section. */
  hebrewYear: number;
  occasionId: number;
  /** The occasion's own raw mafteiach-index date key (e.g. "5736-06A-06") - shown alongside the title (see `hebrewFullDateLabel`) since the player bar and OS media session are never scoped to one source year the way an occasion's own page is, so the occasion label alone doesn't say which year's occurrence is actually playing. */
  hebrewDate: string;
}

/** An occasion's recordings as a playlist - every screen that plays one builds it here. */
export function playlistForEntry(entry: CatalogEntry): Playlist {
  return {
    title: entry.occasionLabel,
    ...(entry.occasionLabelEn && { titleEn: entry.occasionLabelEn }),
    ...(entry.occasionLabelShort && { titleShort: entry.occasionLabelShort }),
    ...(entry.occasionLabelShortEn && { titleShortEn: entry.occasionLabelShortEn }),
    audio: entry.audio,
    hebrewYear: entry.hebrewYear,
    occasionId: entry.occasionId,
    hebrewDate: entry.hebrewDate,
  };
}

/** The playlist's occasion name in the UI language (see `occasionTitle`). */
export function playlistTitle(playlist: Playlist, language: Language): string {
  return occasionTitle(playlistNames(playlist), language);
}

/** The playlist's occasion names, as the catalog's display helpers take them. */
export function playlistNames(playlist: Playlist): Pick<CatalogEntry, 'occasionLabel' | 'occasionLabelEn' | 'occasionLabelShort' | 'occasionLabelShortEn'> {
  return { occasionLabel: playlist.title, occasionLabelEn: playlist.titleEn, occasionLabelShort: playlist.titleShort, occasionLabelShortEn: playlist.titleShortEn };
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
