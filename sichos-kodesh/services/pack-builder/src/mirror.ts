import { createHash } from 'node:crypto';
import { readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArchiveStore } from '@sichos-kodesh/archive';
import { publishKeys } from '@sichos-kodesh/pack-api';
import { MIRRORED_LIST, readMirrored } from './publish.js';

/**
 * `sk-pack mirror`: copies a published directory (publish.ts) to the R2
 * bucket the pack API reads, through Cloudflare's REST API, for a machine
 * with an API token and no rclone. An object is named by its hash, so one
 * the bucket already holds at the same size is skipped; any other file is
 * sent when its MD5 differs from the bucket's ETag. Objects go first and
 * meta.json last, so the Worker never names an object the bucket lacks.
 *
 * With `prune`, every object the bucket holds is dropped from this disk
 * (the published copy and the archive's raw or derived bytes) and listed
 * in `.mirrored.json`, which `publish` reads: a small disk can then publish
 * the whole archive a year at a time.
 */

export interface R2Target {
  accountId: string;
  bucket: string;
  token: string;
  fetch?: typeof fetch;
  /** Defaults to Cloudflare's API; tests point it at a fake. */
  apiBase?: string;
}

export interface MirrorOptions {
  dir: string;
  target: R2Target;
  concurrency?: number;
  /** Drop mirrored objects from this disk, the archive's copies too. */
  prune?: { store: ArchiveStore };
  log?: (line: string) => void;
}

export interface MirrorResult {
  uploaded: number;
  bytes: number;
  unchanged: number;
  pruned: number;
}

interface RemoteObject {
  size: number;
  etag: string;
}

/** Wrangler's own limit for this API; larger objects need S3 multipart. */
const MAX_PUT_BYTES = 300 * 1024 * 1024;

function contentType(key: string): string {
  if (key.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

async function sizeOf(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size;
  } catch {
    return null;
  }
}

async function walk(dir: string, prefix = ''): Promise<string[]> {
  const keys: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.endsWith('.tmp')) continue;
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) keys.push(...(await walk(path.join(dir, entry.name), key)));
    else if (entry.isFile()) keys.push(key);
  }
  return keys;
}

export class R2Client {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly target: R2Target) {
    this.base = `${target.apiBase ?? 'https://api.cloudflare.com/client/v4'}/accounts/${target.accountId}/r2/buckets/${target.bucket}/objects`;
    this.fetchFn = target.fetch ?? fetch;
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      try {
        const response = await this.fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${this.target.token}` } });
        if (response.ok) return response;
        const text = await response.text().catch(() => '');
        lastError = new Error(`R2 ${init.method ?? 'GET'} ${response.status}: ${text.slice(0, 300)}`);
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Every key under `prefix`, with its size and ETag. */
  async list(prefix = ''): Promise<Map<string, RemoteObject>> {
    const found = new Map<string, RemoteObject>();
    let cursor = '';
    for (;;) {
      const query = new URLSearchParams({ per_page: '1000' });
      if (prefix) query.set('prefix', prefix);
      if (cursor) query.set('cursor', cursor);
      const body = (await (await this.call(`${this.base}?${query}`, { method: 'GET' })).json()) as {
        result?: Array<{ key: string; size: number; etag: string }>;
        result_info?: { cursor?: string; is_truncated?: boolean };
      };
      for (const object of body.result ?? []) found.set(object.key, { size: object.size, etag: object.etag.replace(/"/g, '') });
      if (!body.result_info?.is_truncated || !body.result_info.cursor) return found;
      cursor = body.result_info.cursor;
    }
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    if (bytes.length > MAX_PUT_BYTES) throw new Error(`${key} is ${bytes.length} B, over the ${MAX_PUT_BYTES} B this API takes`);
    await this.call(`${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType(key) },
      body: bytes,
    });
  }
}

/** Objects, then the other files (packs, shards, catalog, objects.json), then meta.json. */
function uploadOrder(keys: string[]): string[] {
  const rank = (key: string) => (key.startsWith('objects/') ? 0 : key === publishKeys.meta ? 3 : key === publishKeys.objectsIndex ? 2 : 1);
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export async function mirrorPublished(options: MirrorOptions): Promise<MirrorResult> {
  const log = options.log ?? (() => undefined);
  const client = new R2Client(options.target);
  const remote = await client.list();
  const mirrored = await readMirrored(options.dir);
  const result: MirrorResult = { uploaded: 0, bytes: 0, unchanged: 0, pruned: 0 };
  const keys = uploadOrder(await walk(options.dir));
  const objects = keys.filter((key) => key.startsWith('objects/'));
  const rest = keys.filter((key) => !key.startsWith('objects/'));

  const saveMirrored = async (): Promise<void> => {
    const list = path.join(options.dir, MIRRORED_LIST);
    await writeFile(`${list}.tmp`, JSON.stringify([...mirrored].sort()));
    await rename(`${list}.tmp`, list);
  };
  const prune = async (key: string): Promise<void> => {
    if (!options.prune) return;
    const sha = key.slice('objects/'.length);
    // Listed before the bytes go, so an interrupted run never leaves an object publish cannot account for.
    mirrored.add(sha);
    result.pruned += 1;
    if (result.pruned % 50 === 0) await saveMirrored();
    const archived = options.prune.store.pathOf(sha);
    await unlink(path.join(options.dir, key)).catch(() => undefined);
    if (archived) await unlink(archived).catch(() => undefined);
  };

  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const key = objects[cursor];
      cursor += 1;
      if (!key) return;
      const file = path.join(options.dir, key);
      const size = await sizeOf(file);
      if (size === null) continue;
      if (remote.get(key)?.size === size) result.unchanged += 1;
      else {
        await client.put(key, await readFile(file));
        result.uploaded += 1;
        result.bytes += size;
        log(`up: ${key} ${size} B`);
      }
      await prune(key);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, () => worker()));
  if (options.prune) await saveMirrored();

  for (const key of rest) {
    const bytes = await readFile(path.join(options.dir, key));
    const md5 = createHash('md5').update(bytes).digest('hex');
    const known = remote.get(key);
    if (known && known.size === bytes.length && known.etag === md5) {
      result.unchanged += 1;
      continue;
    }
    await client.put(key, bytes);
    result.uploaded += 1;
    result.bytes += bytes.length;
    log(`up: ${key} ${bytes.length} B`);
  }

  log(`mirror: ${result.uploaded} sent (${result.bytes} B), ${result.unchanged} already there${options.prune ? `, ${result.pruned} dropped from this disk` : ''}`);
  return result;
}
