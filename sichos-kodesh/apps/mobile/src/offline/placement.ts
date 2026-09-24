import type { AudioProfile, ObjectKind, TrustedKeys } from '@sichos-kodesh/pack-format';
import { TRUSTED_PACK_KEYS, developmentTrustedKeys } from '@sichos-kodesh/pack-format';

/**
 * Where an imported object goes, and which objects this build takes.
 *
 * Objects land at the paths the downloader already writes to (relative to
 * the app's files directory, RNBlobUtil's DocumentDir): a recording at its
 * JEM `workerFilename`, a PDF at `<driveFileId>.pdf`. So every screen that
 * shows "downloaded", the player and the PDF viewer find an imported file
 * exactly as they find a downloaded one, with no new lookup. Texts (igros,
 * maanos, transcripts; WP4b reads them) go under `texts/`.
 */

/**
 * The audio profiles this build imports. Only `src`, the original MP3, for
 * now: Opus playback (seeking, background play) is verified on real kosher
 * phones before any `opus*` pack is published (docs/offline-plan.md, WP4
 * item 5). Recordings in other profiles are skipped and counted.
 */
export const IMPORTABLE_AUDIO_PROFILES: readonly AudioProfile[] = ['src'];

export function isImportableProfile(kind: ObjectKind, profile: AudioProfile | undefined): boolean {
  return kind !== 'audio' || IMPORTABLE_AUDIO_PROFILES.includes(profile ?? 'src');
}

const WORKER_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*\.mp3$/;
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
  if (kind === 'audio') return WORKER_FILENAME_RE.test(sourceId) ? sourceId : null;
  if (kind === 'pdf') return DRIVE_FILE_ID_RE.test(sourceId) ? `${sourceId}.pdf` : null;
  if (!TEXT_ID_RE.test(sourceId) || sourceId.includes('..')) return null;
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
