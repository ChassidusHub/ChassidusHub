import type { Track } from 'react-native-track-player';
import type { CatalogAudio, CatalogEntry } from '@sichos-kodesh/catalog';
import type { PlayerChapter } from './playerContext';
import { audioUrl, localAudioFileUrlIfExists } from '../download/download';

/**
 * Maps a catalog entry's audio list to react-native-track-player Track objects.
 * Uses the worker proxy URL as the track URL — the same URL the web player uses.
 * If a local cached copy exists, the caller should substitute `file://` URLs;
 * this function produces the network fallback URLs.
 */
export async function catalogAudioToTracks(entry: CatalogEntry): Promise<Track[]> {
  return Promise.all(
    entry.audio.map(async (audio, index) =>
      catalogAudioToTrack(entry, audio, index, await resolveTrackUrl(audio.workerFilename)),
    ),
  );
}

export function catalogAudioToTrack(
  entry: CatalogEntry,
  audio: CatalogAudio,
  index: number,
  url: string = audioUrl(audio.workerFilename),
): Track {
  return {
    id: audio.workerFilename,
    url,
    title: audio.chapterName ?? (entry.audio.length > 1 ? `Track ${index + 1}` : entry.occasionLabel),
    artist: 'Sichos Kodesh',
    album: entry.occasionLabel,
    duration: audio.durationMs / 1000,
  };
}

export async function resolveTrackUrl(workerFilename: string): Promise<string> {
  const localUrl = await localAudioFileUrlIfExists(workerFilename);
  return localUrl ?? audioUrl(workerFilename);
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
