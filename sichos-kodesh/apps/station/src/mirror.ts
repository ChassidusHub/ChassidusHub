import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { indexPacks, verifyPack } from '@sichos-kodesh/pack-builder';
import type { PackIndexFile, TrustedKeys } from '@sichos-kodesh/pack-format';
import { PACK_EXTENSION, TRUSTED_PACK_KEYS, parsePackIndexFile, parseScope } from '@sichos-kodesh/pack-format';
import type { PackApi } from './api.js';
import type { StationConfig } from './config.js';
import { scopeQuery } from './config.js';

/**
 * The station's local mirror (the overnight half of WP6): every pack the
 * config's scopes call for, fetched from the pack API, verified the way a
 * phone verifies it, and indexed, so a plugged-in phone is served from
 * disk with no internet.
 *
 *   <root>/station.json        the config
 *   <root>/mirror.json         what was fetched, and from which publish
 *   <root>/packs/*.skpack      the packs; packs/index.json lists them
 *   <root>/catalog/<year>.json the scopes' catalog years, for player mode
 *
 * A pack is fetched again only when the archive was published anew (the
 * API dates every build to its publish time, so an unchanged publish means
 * unchanged bytes) or the file is gone.
 */

export const MIRROR_SCHEMA_VERSION = 1 as const;
export const PACKS_DIR = 'packs';
export const CATALOG_DIR = 'catalog';
export const PACK_INDEX_FILE = 'index.json';
const PARTIAL = '.partial';

export interface MirrorFile {
  scope: string;
  /** 1-based, as the API's `part` parameter. */
  part: number;
  bytes: number;
  /** False when kept under `acceptUnsigned` with a signature that did not verify. */
  signed: boolean;
}

export interface MirrorState {
  schema: typeof MIRROR_SCHEMA_VERSION;
  publishedAt: string;
  catalogVersion: string;
  syncedAt: string;
  files: Record<string, MirrorFile>;
}

export interface SyncReport {
  publishedAt: string;
  downloaded: string[];
  kept: string[];
  removed: string[];
  failed: Array<{ file: string; problem: string }>;
  unsigned: string[];
  downloadedBytes: number;
  packs: number;
}

export interface SyncOptions {
  root: string;
  config: StationConfig;
  api: PackApi;
  now?: () => Date;
  log?: (line: string) => void;
}

export const mirrorPaths = (root: string) => ({
  config: path.join(root, 'station.json'),
  state: path.join(root, 'mirror.json'),
  packs: path.join(root, PACKS_DIR),
  index: path.join(root, PACKS_DIR, PACK_INDEX_FILE),
  catalog: (year: number) => path.join(root, CATALOG_DIR, `${year}.json`),
});

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

export async function readMirrorState(root: string): Promise<MirrorState | null> {
  const value = (await readJson(mirrorPaths(root).state)) as MirrorState | null;
  return value && value.schema === MIRROR_SCHEMA_VERSION && typeof value.files === 'object' ? value : null;
}

/** The mirror's pack index, or null before the first sync. */
export async function readMirrorIndex(root: string): Promise<PackIndexFile | null> {
  return parsePackIndexFile(await readJson(mirrorPaths(root).index));
}

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

async function download(response: Response, file: string): Promise<void> {
  if (!response.body) throw new Error('empty response');
  await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>), createWriteStream(file));
}

export async function syncMirror(options: SyncOptions): Promise<SyncReport> {
  const { root, config, api } = options;
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => new Date());
  const paths = mirrorPaths(root);
  await mkdir(paths.packs, { recursive: true });
  const trusted: TrustedKeys = { ...TRUSTED_PACK_KEYS, ...config.trust };

  const meta = await api.meta();
  const previous = await readMirrorState(root);
  const samePublish = previous?.publishedAt === meta.publishedAt;
  const report: SyncReport = { publishedAt: meta.publishedAt, downloaded: [], kept: [], removed: [], failed: [], unsigned: [], downloadedBytes: 0, packs: 0 };
  const files: Record<string, MirrorFile> = {};

  for (const scope of config.scopes) {
    const query = scopeQuery(config, scope);
    const size = await api.size(query);
    for (const part of size.parts) {
      const file = part.file;
      const target = path.join(paths.packs, file);
      const known = previous?.files[file];
      if (samePublish && known && (await exists(target))) {
        files[file] = known;
        report.kept.push(file);
        if (!known.signed) report.unsigned.push(file);
        continue;
      }
      const partial = target + PARTIAL;
      try {
        log(`${file}: fetching`);
        await download(await api.build(query, part.index + 1), partial);
        const check = await verifyPack(partial, trusted);
        const signatureOnly = check.problems.length > 0 && check.problems.every((problem) => problem.startsWith('signature:'));
        if (!check.ok && !(signatureOnly && config.acceptUnsigned)) throw new Error(check.problems.slice(0, 3).join('; '));
        await rename(partial, target);
        const signed = check.ok;
        files[file] = { scope, part: part.index + 1, bytes: check.zipBytes, signed };
        report.downloaded.push(file);
        report.downloadedBytes += check.zipBytes;
        if (!signed) report.unsigned.push(file);
        log(`${file}: ${check.objects} objects, ${check.zipBytes} bytes${signed ? '' : ' (unsigned)'}`);
      } catch (error) {
        await unlink(partial).catch(() => undefined);
        const problem = error instanceof Error ? error.message : String(error);
        report.failed.push({ file, problem });
        log(`${file}: FAILED - ${problem}`);
        // A copy from an earlier publish still serves phones until the next sync.
        if (known && (await exists(target))) files[file] = known;
      }
    }
  }

  for (const name of await readdir(paths.packs)) {
    const isPack = name.endsWith(PACK_EXTENSION);
    if ((isPack && !files[name]) || name.endsWith(PARTIAL)) {
      await unlink(path.join(paths.packs, name));
      if (isPack) report.removed.push(name);
    }
  }

  const { index } = await indexPacks(paths.packs, now);
  await writeFile(paths.index, `${JSON.stringify(index, null, 2)}\n`);
  report.packs = index.packs.length;

  await mkdir(path.join(root, CATALOG_DIR), { recursive: true });
  const years = [...new Set(config.scopes.map((scope) => parseScope(scope).year))];
  for (const year of years) await writeFile(paths.catalog(year), JSON.stringify(await api.catalogYear(year)));

  const state: MirrorState = { schema: MIRROR_SCHEMA_VERSION, publishedAt: meta.publishedAt, catalogVersion: meta.catalogVersion, syncedAt: now().toISOString(), files };
  await writeFile(paths.state, `${JSON.stringify(state, null, 2)}\n`);
  return report;
}
