import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { CatalogContentsEntry, CatalogWorkContents, CatalogWorksIndex } from '@chassidushub-reader/catalog';
import type { ObjectsIndex, PackEntry, ShelfInput, WorkPart, WorksShelf } from '@chassidushub-reader/pack-format';
import { MANIFEST_ENTRY_NAME, OBJECTS_DIR, OBJECTS_INDEX_SCHEMA_VERSION, PACK_EXTENSION, bundleWorks, parsePackManifest } from '@chassidushub-reader/pack-format';
import type { YearShard } from '@chassidushub-reader/pack-api';
import { entryStream, readEntry, readZipDirectory } from './zip.js';

/**
 * The seforim for the pack API, from the text packs `sk-pack build-work`
 * made (in the packs directory): each work's entries as its pack carries
 * them, its objects (texts and search index) laid out like every other
 * object, their CRC-32s straight from the pack's ZIP directory, and the
 * shelf that bundles them by author. A pack from the API that adds the
 * seforim then holds exactly what the text packs hold.
 */

export interface PublishedWorks {
  shelf: WorksShelf;
  entries: Map<string, PackEntry[]>;
  /** Each sefer with parts: part id -> the item ids of its texts (`works/<id>.parts.json`). */
  parts: Map<string, Record<string, string[]>>;
  shard: YearShard;
  /** Objects written into the published directory this time. */
  written: number;
}

/**
 * A sefer's parts: its contents' top-level sections, when every one of
 * them is a named section and there are at least two (Igros Kodesh's
 * volumes, Tanya's parts), each with the item ids, bytes and texts of the
 * units under it. The whole sefer's search index belongs to none.
 */
export function workParts(workId: string, contents: CatalogWorkContents, entries: PackEntry[]): { parts: WorkPart[]; items: Record<string, string[]> } | null {
  const top = contents.contents;
  const isNode = (entry: CatalogContentsEntry): entry is Extract<CatalogContentsEntry, { entries: unknown }> => 'entries' in entry;
  if (top.length < 2 || !top.every(isNode)) return null;
  const units = (entry: CatalogContentsEntry): string[] => (isNode(entry) ? entry.entries.flatMap(units) : [entry.unitId]);
  const byItem = new Map(entries.map((entry) => [entry.itemId, entry]));
  const parts: WorkPart[] = [];
  const items: Record<string, string[]> = {};
  top.forEach((node, index) => {
    const ids = [...new Set(units(node).map((unit) => `${workId}/${unit}`))].filter((id) => byItem.has(id));
    if (ids.length === 0) return;
    const refs = new Map(ids.flatMap((id) => byItem.get(id)!.refs.map((ref) => [ref.sha256, ref] as const)));
    const id = String(index + 1);
    items[id] = ids;
    parts.push({ id, label: node.title, bytes: [...refs.values()].reduce((sum, ref) => sum + ref.bytes, 0), texts: [...refs.values()].filter((ref) => ref.kind === 'text').length });
  });
  return parts.length > 1 ? { parts, items } : null;
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

export async function publishWorks(options: {
  packsDir: string;
  outDir: string;
  works: CatalogWorksIndex | null;
  /** A sefer's contents, for its parts; none, and it is offered whole only. */
  contents?: (workId: string) => Promise<CatalogWorkContents | null>;
  catalogVersion: string;
  builtAt: string;
  crcs: Map<string, number>;
  /** Objects already in the mirror and gone from this disk (publish.ts). */
  mirrored: ReadonlySet<string>;
}): Promise<PublishedWorks | null> {
  const files = (await readdir(options.packsDir)).filter((name) => name.endsWith(PACK_EXTENSION)).sort();
  const entries = new Map<string, PackEntry[]>();
  const index: ObjectsIndex = { schema: OBJECTS_INDEX_SCHEMA_VERSION, version: options.catalogVersion, builtAt: options.builtAt, objects: {} };
  const crc32: Record<string, number> = {};
  let written = 0;
  await mkdir(path.join(options.outDir, 'objects'), { recursive: true });
  for (const name of files) {
    const file = path.join(options.packsDir, name);
    const directory = await readZipDirectory(file);
    const manifestEntry = directory.find((entry) => entry.name === MANIFEST_ENTRY_NAME);
    if (!manifestEntry) continue;
    const manifest = parsePackManifest(JSON.parse((await readEntry(file, manifestEntry)).toString('utf8')));
    if (!manifest || manifest.scope.kind !== 'work' || !manifest.scope.work) continue;
    const workId = manifest.scope.work;
    entries.set(workId, [...(entries.get(workId) ?? []), ...manifest.entries]);
    const inZip = new Map(directory.filter((entry) => entry.name.startsWith(OBJECTS_DIR)).map((entry) => [entry.name.slice(OBJECTS_DIR.length), entry]));
    for (const entry of manifest.entries) {
      for (const ref of entry.refs) {
        const zipped = inZip.get(ref.sha256);
        if (!zipped) throw new Error(`${name} names ${ref.sha256} but does not carry it`);
        index.objects[ref.sha256] = { kind: ref.kind, bytes: ref.bytes, sourceId: ref.sourceId, collection: 'works', itemId: entry.itemId };
        crc32[ref.sha256] = zipped.crc32;
        options.crcs.set(ref.sha256, zipped.crc32);
        const target = path.join(options.outDir, 'objects', ref.sha256);
        if (options.mirrored.has(ref.sha256) || (await exists(target))) continue;
        await pipeline(entryStream(file, zipped), createWriteStream(`${target}.tmp`));
        await rename(`${target}.tmp`, target);
        written += 1;
      }
    }
  }
  if (entries.size === 0) return null;

  const parts = new Map<string, Record<string, string[]>>();
  const inputs: ShelfInput[] = [];
  for (const [id, list] of entries) {
    const work = options.works?.works.find((w) => w.id === id);
    const objects = new Map(list.flatMap((entry) => entry.refs.map((ref) => [ref.sha256, ref.bytes] as const)));
    const contents = options.contents ? await options.contents(id) : null;
    const split = contents ? workParts(id, contents, list) : null;
    if (split) parts.set(id, split.items);
    inputs.push({
      id,
      title: work?.title ?? { he: list[0]?.label ?? id, en: id },
      ...(work?.authors?.[0] ? { author: work.authors[0] } : {}),
      bytes: [...objects.values()].reduce((sum, bytes) => sum + bytes, 0),
      texts: list.flatMap((entry) => entry.refs).filter((ref) => ref.kind === 'text').length,
      ...(split ? { parts: split.parts } : {}),
    });
  }
  // The catalog's order of works, so a bundle lists them as the app does.
  const order = options.works?.works.map((w) => w.id) ?? [];
  inputs.sort((a, b) => (order.indexOf(a.id) + 1 || 1e9) - (order.indexOf(b.id) + 1 || 1e9));
  const shelf = bundleWorks(inputs, options.works?.authors ?? []);
  return { shelf, entries, parts, shard: { index, crc32 }, written };
}
