import RNBlobUtil from 'react-native-blob-util';
import { downloadAudio } from '../download/download';
import { loadLocalSound } from './playLocalFile';
import type { LoadedSound } from './playLocalFile';

function localPathFor(workerFilename: string): string {
  return `${RNBlobUtil.fs.dirs.DocumentDir}/${workerFilename}`;
}

/**
 * Loads one chapter's audio, from its cached local copy if this chapter
 * was already played before (see `downloadAudio`'s destination,
 * `RNBlobUtil.fs.dirs.DocumentDir` - the app's persistent storage, not a
 * cache directory the OS can evict), otherwise downloading it in full
 * first.
 *
 * A previous version of this started playback immediately from the
 * Worker's own URL (react-native-sound streaming it, like the underlying
 * native `AVPlayer`/`MediaPlayer` can) while downloading a separate copy
 * to cache in the background. In practice that meant two concurrent
 * requests for the *same* file competing for the same device's bandwidth -
 * confirmed as the real cause of playback still being slow to start, not
 * actually behaving as a stream. Worse, skipping to another chapter while
 * that background download was still in flight left it running unawaited
 * with nothing to cancel it, so a later play of that same chapter could
 * find a since-finished (or, before download.ts's atomic-rename fix, a
 * still-partial) file and treat it as "already cached" - the concrete
 * cause of a stuck player after skipping. One download per chapter,
 * awaited before playback starts, is what actually stayed reliable - the
 * "Loading..." state callers show while this resolves is silent
 * (no percentage) on purpose, not a regression from the streaming attempt.
 */
export async function loadCachedSound(workerFilename: string): Promise<LoadedSound> {
  const localPath = localPathFor(workerFilename);
  const alreadyCached = await RNBlobUtil.fs.exists(localPath);
  if (!alreadyCached) await downloadAudio(workerFilename);
  return loadLocalSound(localPath);
}
