import { spawn } from 'node:child_process';
import { stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import type { ArchiveStore } from '@chassidushub-reader/archive';
import { hashFile, parseCrawlScope } from '@chassidushub-reader/archive';
import type { AudioProfile } from '@chassidushub-reader/pack-format';

/**
 * Encodes the archive's original recordings into a smaller audio profile,
 * once: each (original, profile) pair is recorded in `derivations` and the
 * bytes stored under derived/<profile>/, so a pack in that profile is again
 * only a concatenation. The encode is bit-exact (no random Ogg serial, no
 * encoder tag), so the same original always gives the same hash.
 *
 * Speech carries well at low rates; singing does not. A track whose
 * chapter name says it is a nigun is encoded one profile up (opus24 -> 32k)
 * but still filed under the profile asked for, so packs stay uniform.
 */

export type EncodedProfile = Exclude<AudioProfile, 'src'>;

const KBPS: Record<EncodedProfile, number> = { opus16: 16, opus24: 24, opus32: 32, 'mp3-32': 32 };
const ONE_UP: Record<EncodedProfile, EncodedProfile> = { opus16: 'opus24', opus24: 'opus32', opus32: 'opus32', 'mp3-32': 'mp3-32' };
const NIGUN = /nig+un/i;

export function isNigun(labels: Array<string | null>): boolean {
  return labels.some((label) => !!label && NIGUN.test(label));
}

/** ffmpeg's arguments for one encode, and the `encoder` line recorded with it. */
export function encoderArgs(profile: EncodedProfile, input: string, output: string, nigun: boolean): { args: string[]; encoder: string } {
  const effective = nigun ? ONE_UP[profile] : profile;
  const kbps = KBPS[effective];
  const common = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input, '-vn', '-map_metadata', '-1', '-ac', '1'];
  const exact = ['-fflags', '+bitexact', '-flags:a', '+bitexact'];
  if (effective === 'mp3-32') {
    return {
      args: [...common, '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, ...exact, '-id3v2_version', '0', '-write_xing', '0', '-f', 'mp3', output],
      encoder: `libmp3lame ${kbps}k cbr mono`,
    };
  }
  return {
    args: [...common, '-c:a', 'libopus', '-b:a', `${kbps}k`, '-vbr', 'on', '-application', 'audio', '-frame_duration', '60', ...exact, '-f', 'opus', output],
    encoder: `libopus ${kbps}k vbr mono 60ms${nigun ? ' (nigun, one profile up)' : ''}`,
  };
}

export type Encode = (args: string[]) => Promise<void>;

/** Runs ffmpeg; rejects with its error output when it fails. */
export function ffmpegEncoder(binary: string): Encode {
  return (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(-500)}`))));
    });
}

export interface TranscodeOptions {
  profile: EncodedProfile;
  encode: Encode;
  collection?: string;
  /** A Hebrew year or year-month, as `sk-archive crawl --scope`. */
  scope?: string;
  limit?: number;
  concurrency?: number;
  log?: (line: string) => void;
}

export interface TranscodeResult {
  encoded: number;
  skipped: number;
  failed: number;
  bytesIn: number;
  bytesOut: number;
}

const ORIGINALS = `
SELECT DISTINCT o.sha256, o.bytes
FROM objects o
JOIN refs r ON r.sha256 = o.sha256 AND r.removed_commit IS NULL
LEFT JOIN wanted w ON w.collection = r.collection AND w.item_id = r.item_id AND w.kind = r.kind AND w.source_id = r.source_id AND w.role = r.role
WHERE o.kind = 'audio' AND (o.profile = 'src' OR o.profile IS NULL)
  AND (:collection = '' OR r.collection = :collection)
  AND (:year IS NULL OR w.hebrew_year = :year)
  AND (:datePrefix = '' OR w.hebrew_date LIKE :datePrefix || '-%')
ORDER BY o.sha256`;

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export async function transcode(store: ArchiveStore, options: TranscodeOptions): Promise<TranscodeResult> {
  const log = options.log ?? (() => undefined);
  const scope = options.scope ? parseCrawlScope(options.scope) : null;
  const originals = store.db.prepare(ORIGINALS).all({ collection: options.collection ?? '', year: scope?.year ?? null, datePrefix: scope?.datePrefix ?? '' }) as Array<{ sha256: string; bytes: number }>;
  const derivation = store.db.prepare('SELECT sha256 FROM derivations WHERE src_sha256 = ? AND profile = ?');
  const labels = store.db.prepare('SELECT DISTINCT label FROM refs WHERE sha256 = ? AND removed_commit IS NULL');
  const result: TranscodeResult = { encoded: 0, skipped: 0, failed: 0, bytesIn: 0, bytesOut: 0 };

  const pending: Array<{ sha256: string; bytes: number }> = [];
  for (const original of originals) {
    const done = derivation.get(original.sha256, options.profile) as { sha256: string } | undefined;
    // Encoded before, and either still here or mirrored off this disk with its original (sk-pack mirror --prune).
    if (done && ((await exists(store.derivedPath(options.profile, done.sha256))) || !(await store.objectExistsOnDisk(original.sha256)))) result.skipped += 1;
    else pending.push(original);
  }
  const queue = pending.slice(0, options.limit ?? pending.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const original = queue[cursor];
      cursor += 1;
      if (!original) return;
      const nigun = isNigun((labels.all(original.sha256) as Array<{ label: string | null }>).map((row) => row.label));
      const tmp = store.tmpPath();
      const { args, encoder } = encoderArgs(options.profile, store.objectPath(original.sha256), tmp, nigun);
      try {
        await options.encode(args);
        const { sha256, bytes } = await hashFile(tmp);
        await store.putDerived(tmp, original.sha256, options.profile, sha256, bytes, encoder);
        result.encoded += 1;
        result.bytesIn += original.bytes;
        result.bytesOut += bytes;
        log(`ok: ${original.sha256.slice(0, 12)} -> ${options.profile} ${sha256.slice(0, 12)} (${original.bytes} -> ${bytes} B${nigun ? ', nigun' : ''})`);
      } catch (error) {
        await unlink(tmp).catch(() => undefined);
        result.failed += 1;
        log(`failed: ${original.sha256.slice(0, 12)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  const concurrency = Math.max(1, options.concurrency ?? Math.max(1, Math.floor(os.cpus().length / 2)));
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  return result;
}
