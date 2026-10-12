import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { healthMarkdown, snapshotHealth, type HealthCounts, type HealthTree, type HealthWorkFile } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import type { Context } from './commands.js';

/**
 * `chassidushub catalog-health`: the catalog's health from its snapshot
 * (docs/catalog-snapshot.md), read the way the site's browser reads it, from
 * the public files. It reads no database and writes nothing to the catalog,
 * so the nightly run (.github/workflows/catalog-health.yml) needs no secret.
 * Writes report.json (every item behind every count) and report.md (the
 * counts, their change since `previous`, and the worst of each) to `out`.
 */

/** The snapshot format this reads (SNAPSHOT_FORMAT). */
const FORMAT = 1;

interface Manifest {
  format: number;
  version: string;
  changedAt?: string;
  builtAt?: string;
  base?: string;
  tree: { file: string };
  names?: { file: string };
  works: Record<EntityId, { file: string; units: number }>;
}

/** Where the snapshot's files come from: the API, or a folder holding manifest.json and files/ (tests, a copy). */
export function snapshotSource(from: string): { manifest: () => Promise<Manifest>; file: <T>(manifest: Manifest, name: string) => Promise<T> } {
  const remote = /^https?:\/\//.test(from);
  const api = from.replace(/\/+$/, '');
  const get = async <T>(url: string): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'ChassidusHub catalog-health' } });
      if (response.ok) return (await response.json()) as T;
      if (attempt >= 3 || response.status < 500) throw new Error(`${response.status} for ${url}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  };
  if (remote) {
    return {
      manifest: () => get<Manifest>(`${api}/v1/catalog/manifest.json`),
      file: (manifest, name) => get(`${manifest.base || `${api}/v1/catalog/files/`}${encodeURIComponent(name)}`),
    };
  }
  const read = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
  return { manifest: () => read<Manifest>(join(from, 'manifest.json')), file: (_, name) => read(join(from, 'files', name)) };
}

/** Runs `fn` over `items`, `width` at a time. */
async function inTurns<T>(items: T[], width: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  }));
}

export async function catalogHealthCommand(ctx: Context, input: { from?: string; out?: string; previous?: string; rows?: number }): Promise<void> {
  const source = snapshotSource(input.from ?? 'https://api.chassidushub.org');
  const manifest = await source.manifest();
  if (manifest.format !== FORMAT) throw new Error(`the snapshot is format ${manifest.format}; this reads format ${FORMAT}`);
  const tree = await source.file<HealthTree>(manifest, manifest.tree.file);

  // Each unit's own level (sicha, letter, chapter), from names.json by path: a chapter is rightly named by its number.
  const kinds = new Map<string, string>();
  if (manifest.names) {
    const names = await source.file<{ names: Array<[string, string, string | null, string | null, string]> }>(manifest, manifest.names.file);
    for (const [kind, , , , path] of names.names) kinds.set(path, kind);
  }
  const files = new Map<EntityId, HealthWorkFile>();
  await inTurns(Object.entries(manifest.works), 8, async ([id, entry]) => {
    const file = await source.file<HealthWorkFile>(manifest, entry.file);
    for (const part of file.parts) for (const unit of part.items) if (unit.path && kinds.has(unit.path)) unit.kind = kinds.get(unit.path);
    files.set(id as EntityId, file);
  });
  ctx.log(`snapshot ${manifest.version}: ${Object.keys(tree.sets).length} shelves, ${Object.keys(tree.works).length} sefarim, ${files.size} files of units`);

  const report = await snapshotHealth({ version: manifest.version, changedAt: manifest.changedAt, builtAt: manifest.builtAt }, tree, async (id) => files.get(id) ?? null);
  let previous: HealthCounts | null = null;
  if (input.previous) {
    try {
      const kept = JSON.parse(await readFile(input.previous, 'utf8')) as { counts?: HealthCounts } & Partial<HealthCounts>;
      previous = kept.counts ?? (kept as HealthCounts);
    } catch {
      ctx.log(`no earlier counts at ${input.previous}`);
    }
  }
  const markdown = healthMarkdown(report, { previous, rows: input.rows });
  const out = input.out ?? 'catalog-health';
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
  await writeFile(join(out, 'report.md'), `${markdown}\n`);
  for (const [key, value] of Object.entries(report.counts)) ctx.log(`${key}: ${value}`);
}
