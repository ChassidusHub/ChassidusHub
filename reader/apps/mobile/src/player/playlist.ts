import type { Track } from 'react-native-track-player';
import { audioChapterName, occasionTitle, trackLabel } from '@chassidushub-reader/app-core';
import type { Language } from '@chassidushub-reader/app-core';
import type { CatalogAudio, CatalogEntry } from '@chassidushub-reader/catalog';
import { audioUrl, localAudioFileUrlIfExists } from '../download/download';

type PlaylistSource = Pick<CatalogEntry, 'audio' | 'occasionLabel' | 'occasionLabelEn' | 'occasionLabelShort' | 'occasionLabelShortEn'>;

/**
 * Maps a playlist's audio list to react-native-track-player Track objects.
 * A chapter already downloaded plays from its local file; otherwise the
 * track URL is services/media-proxy's - the same URL the web player streams.
 * The names (what the notification and lock screen show) are in `language`.
 */
export async function catalogAudioToTracks(source: PlaylistSource, language: Language): Promise<Track[]> {
  return Promise.all(
    source.audio.map(async (audio, index) => catalogAudioToTrack(source, audio, index, language, await resolveTrackUrl(audio.workerFilename))),
  );
}

export function catalogAudioToTrack(source: PlaylistSource, audio: CatalogAudio, index: number, language: Language, url: string = audioUrl(audio.workerFilename)): Track {
  return {
    id: audio.workerFilename,
    url,
    ...trackMetadata(source, audio, index, language),
    duration: audio.durationMs / 1000,
  };
}

/** A track's names: the chapter (or "Track N", or the occasion itself when it is the only recording) as the title, the occasion as the album. */
export function trackMetadata(source: PlaylistSource, audio: CatalogAudio, index: number, language: Language): { title: string; artist: string; album: string } {
  const occasion = occasionTitle(source, language);
  return {
    title: audioChapterName(audio, language) ?? (source.audio.length > 1 ? trackLabel(index + 1, language) : occasion),
    artist: 'ChassidusHub',
    album: occasion,
  };
}

export async function resolveTrackUrl(workerFilename: string): Promise<string> {
  const localUrl = await localAudioFileUrlIfExists(workerFilename);
  return localUrl ?? audioUrl(workerFilename);
}
