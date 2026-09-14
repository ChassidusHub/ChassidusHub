import RNBlobUtil from 'react-native-blob-util';
import { MEDIA_PROXY_BASE_URL } from '../config';
import { downloadAudio } from '../download/download';
import { loadLocalSound } from './playLocalFile';
import type { LoadedSound } from './playLocalFile';

function localPathFor(workerFilename: string): string {
  return `${RNBlobUtil.fs.dirs.DocumentDir}/${workerFilename}`;
}

/**
 * Starts playback immediately by handing react-native-sound the Worker's
 * own URL directly - it (like the underlying native `AVPlayer`/
 * `MediaPlayer`) can play straight from a remote URL, buffering
 * progressively, instead of this app fetching the whole file itself
 * first. A farbrengen's recordings run 20-40+ minutes; waiting for that
 * entire download before hearing the first second was a real, reported
 * problem, not a hypothetical one.
 *
 * If a previous play already fully downloaded this chapter (see
 * `downloadAudio`'s destination, `RNBlobUtil.fs.dirs.DocumentDir` - the
 * app's persistent storage, not a cache directory the OS can evict),
 * loads that local copy directly instead - no network at all, and correct
 * offline. Otherwise, kicks off that same background download now (not
 * awaited - it must not block the stream already playing) so the *next*
 * play of this chapter is instant and works offline, without the first
 * play having to wait for it.
 */
export async function loadStreamingOrCachedSound(
  workerFilename: string,
  onDownloadProgress?: (p: { received: number; total: number }) => void,
): Promise<LoadedSound> {
  const localPath = localPathFor(workerFilename);
  const alreadyCached = await RNBlobUtil.fs.exists(localPath);

  if (alreadyCached) {
    return loadLocalSound(localPath);
  }

  downloadAudio(workerFilename, onDownloadProgress).catch(() => {
    // Best-effort caching only - a failed background download doesn't affect the stream already playing.
  });

  return loadLocalSound(`${MEDIA_PROXY_BASE_URL}/jem-audio/${workerFilename}`);
}
