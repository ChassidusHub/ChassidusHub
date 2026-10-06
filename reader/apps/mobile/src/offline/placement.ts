import type { AudioProfile, ObjectKind, TrustedKeys } from '@chassidushub-reader/pack-format';
import { TRUSTED_PACK_KEYS, developmentTrustedKeys } from '@chassidushub-reader/pack-format';

/**
 * Where an imported object goes, and which objects this build takes.
 *
 * Objects land at the paths the downloader already writes to (relative to
 * the app's files directory, RNBlobUtil's DocumentDir): a recording at its
 * JEM `workerFilename`, a PDF at `<driveFileId>.pdf`. So every screen that
 * shows "downloaded", the player and the PDF viewer find an imported file
 * exactly as they find a downloaded one, with no new lookup. Texts (the
 * seforim of catalog schema 3, and later igros, maanos, transcripts) go
 * under `texts/`, and each work's search index under `indexes/`.
 */

/**
 * The audio profiles this build imports: the original MP3 (`src`) and the
 * Opus encodings (WP18; Android plays Ogg Opus natively, and ExoPlayer seeks
 * in it). `mp3-32` is for MP3 players (apps/station) and is skipped and
 * counted, as is any profile a later pack may bring.
 */
export const IMPORTABLE_AUDIO_PROFILES: readonly AudioProfile[] = ['src', 'opus16', 'opus24', 'opus32'];

export function isImportableProfile(kind: ObjectKind, profile: AudioProfile | undefined): boolean {
  return kind !== 'audio' || IMPORTABLE_AUDIO_PROFILES.includes(profile ?? 'src');
}

const WORKER_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*\.mp3$/;

/**
 * Where a recording in one profile lives: the MP3 at its JEM
 * `workerFilename` (where a download writes it too), an Opus encoding
 * beside it under its profile's name (`JEMSK0562A.opus16.opus`), so two
 * encodings of one recording never overwrite each other.
 */
export function audioFileName(workerFilename: string, profile: AudioProfile = 'src'): string {
  return profile === 'src' ? workerFilename : workerFilename.replace(/\.mp3$/i, `.${profile}.opus`);
}

/** Every file a recording may be on the phone as, best first: the original, then the Opus encodings from the largest down. */
export function audioFileNames(workerFilename: string): string[] {
  if (!/\.mp3$/i.test(workerFilename)) return [workerFilename];
  return [workerFilename, ...(['opus32', 'opus24', 'opus16'] as const).map((profile) => audioFileName(workerFilename, profile))];
}
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const TEXT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;

/**
 * The object's file, relative to the files directory, or null when this
 * build does not take it (another audio profile) or its id is not a safe
 * file name. Ids come from signed manifests or the objects index, but a
 * name is still never allowed to leave the files directory.
 */
export function objectFileName(kind: ObjectKind, sourceId: string, profile?: AudioProfile): string | null {
  if (!isImportableProfile(kind, profile)) return null;
  if (kind === 'audio') return WORKER_FILENAME_RE.test(sourceId) ? audioFileName(sourceId, profile) : null;
  if (kind === 'pdf') return DRIVE_FILE_ID_RE.test(sourceId) ? `${sourceId}.pdf` : null;
  if (!TEXT_ID_RE.test(sourceId) || sourceId.includes('..')) return null;
  if (kind === 'search') return `indexes/${sourceId.replace(/:/g, '_')}.sqlite`;
  return `texts/${sourceId.replace(/:/g, '_')}.html`;
}

/**
 * The keys a pack must be signed with. Release builds trust only
 * `TRUSTED_PACK_KEYS` (the key Shmuly generates with `sk-pack keygen`);
 * debug builds also trust the published development key, so a pack built
 * with `sk-pack keygen --dev` can be tested on a debug APK.
 */
export function trustedPackKeys(dev: boolean = typeof __DEV__ !== 'undefined' && __DEV__): TrustedKeys {
  return dev ? { ...TRUSTED_PACK_KEYS, ...developmentTrustedKeys() } : { ...TRUSTED_PACK_KEYS };
}

/** Free space an import must leave, beyond the bytes it writes. */
export const IMPORT_SPACE_MARGIN = 64 * 1024 * 1024;
