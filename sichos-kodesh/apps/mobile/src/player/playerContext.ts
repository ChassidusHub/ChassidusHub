import { createContext } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';

export interface PlayerChapter {
  workerFilename: string;
  chapterName: string | null;
  durationMs: number;
  /** The catalog entry this chapter belongs to */
  occasionId: number;
  hebrewYear: number;
  occasionLabel: string;
}

export interface PlayerContextValue {
  /** Currently loaded chapters (queue) */
  chapters: PlayerChapter[];
  /** Index of the currently active chapter, or null */
  currentIndex: number | null;
  /** True while the player is actively playing */
  isPlaying: boolean;
  /** True while the player is loading/buffering */
  isLoading: boolean;
  /** True when there was a playback error */
  hasError: boolean;
  /** Elapsed seconds in current chapter */
  position: number;
  /** Duration of current chapter in seconds */
  duration: number;

  /** Load the given catalog entry's audio and start playing */
  playOccasion: (entry: CatalogEntry) => Promise<void>;
  /** Toggle play/pause */
  togglePlay: () => Promise<void>;
  /** Skip to next chapter */
  next: () => Promise<void>;
  /** Skip to previous chapter */
  prev: () => Promise<void>;
  /** Skip to a specific chapter index */
  skipTo: (index: number) => Promise<void>;
  /** Seek to a position in seconds */
  seekTo: (seconds: number) => Promise<void>;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);
