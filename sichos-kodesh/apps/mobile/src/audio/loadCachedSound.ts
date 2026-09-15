import RNBlobUtil from 'react-native-blob-util';
import { downloadAudio } from '../download/download';
import { loadLocalSound } from './playLocalFile';
import type { LoadedSound } from './playLocalFile';

function localPathFor(workerFilename: string): string {
  return `${RNBlobUtil.fs.dirs.DocumentDir}/${workerFilename}`;
}

/**
 * Loads one chapter's audio, playing from the local cached copy if this
 * chapter was already downloaded (see `downloadAudio`'s destination,
 * `RNBlobUtil.fs.dirs.DocumentDir` - persistent storage, not a cache
 * directory the OS can evict), otherwise downloading it in full first.
 *
 * Always downloads to completion before playback starts, one download at
 * a time per chapter - this keeps a chapter skip from leaving a stale
 * background download racing a later "is this cached" check.
 */
export async function loadCachedSound(workerFilename: string): Promise<LoadedSound> {
  const localPath = localPathFor(workerFilename);
  const alreadyCached = await RNBlobUtil.fs.exists(localPath);
  if (!alreadyCached) await downloadAudio(workerFilename);
  return loadLocalSound(localPath);
}
