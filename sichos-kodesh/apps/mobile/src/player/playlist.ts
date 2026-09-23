import type { Track } from 'react-native-track-player';
import type { CatalogAudio, CatalogEntry } from '@sichos-kodesh/catalog';
import { audioUrl, localAudioFileUrlIfExists } from '../download/download';

type PlaylistSource = Pick<CatalogEntry, 'audio' | 'occasionLabel'>;

/**
 * Maps a playlist's audio list to react-native-track-player Track objects.
 * A chapter already downloaded plays from its local file; otherwise the
 * track URL is services/media-proxy's - the same URL the web player streams.
 */
export async function catalogAudioToTracks(source: PlaylistSource): Promise<Track[]> {
  return Promise.all(
    source.audio.map(async (audio, index) => catalogAudioToTrack(source, audio, index, await resolveTrackUrl(audio.workerFilename))),
  );
}

export function catalogAudioToTrack(source: PlaylistSource, audio: CatalogAudio, index: number, url: string = audioUrl(audio.workerFilename)): Track {
  return {
    id: audio.workerFilename,
    url,
    title: audio.chapterName ?? (source.audio.length > 1 ? `Track ${index + 1}` : source.occasionLabel),
    artist: 'Sichos Kodesh',
    album: source.occasionLabel,
    duration: audio.durationMs / 1000,
  };
}

export async function resolveTrackUrl(workerFilename: string): Promise<string> {
  const localUrl = await localAudioFileUrlIfExists(workerFilename);
  return localUrl ?? audioUrl(workerFilename);
}
