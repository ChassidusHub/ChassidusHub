import type { Track } from 'react-native-track-player';
import type { CatalogAudio, CatalogEntry } from '@sichos-kodesh/catalog';
import type { PlayerChapter } from './playerContext';
import { audioUrl } from '../download/download';

/**
 * Maps a catalog entry's audio list to react-native-track-player Track objects.
 * Uses the worker proxy URL as the track URL — the same URL the web player uses.
 * If a local cached copy exists, the caller should substitute `file://` URLs;
 * this function produces the network fallback URLs.
 */
export function catalogAudioToTracks(entry: CatalogEntry): Track[] {
  return entry.audio.map((audio, index) => catalogAudioToTrack(entry, audio, index));
}

export function catalogAudioToTrack(
  entry: CatalogEntry,
  audio: CatalogAudio,
  index: number,
): Track {
  return {
    id: audio.workerFilename,
    url: audioUrl(audio.workerFilename),
    title: audio.chapterName ?? (entry.audio.length > 1 ? `Track ${index + 1}` : entry.occasionLabel),
    artist: 'Sichos Kodesh',
    album: entry.occasionLabel,
    duration: audio.durationMs / 1000,
  };
}

export function catalogAudioToChapter(
  entry: CatalogEntry,
  audio: CatalogAudio,
): PlayerChapter {
  return {
    workerFilename: audio.workerFilename,
    chapterName: audio.chapterName ?? null,
    durationMs: audio.durationMs,
    occasionId: entry.occasionId,
    hebrewYear: entry.hebrewYear,
    occasionLabel: entry.occasionLabel,
  };
}
