import type { CatalogUnit, CatalogWork, CatalogWorkContents, CatalogWorksIndex } from '@sichos-kodesh/catalog';
import { normalizeSearchText, searchIndexQuery } from '@sichos-kodesh/pack-format';
import { readHeldObjects } from '../offline/objectStore';
import type { PacksNativeModule } from '../offline/packsNative';
import { savedSearchIndexes } from './savedStore';
import { snippetAround } from './seforimModel';
import { readUnitTextFile } from './seforimText';
import { textObjectPlainText } from './textObject';

/**
 * Searching the seforim:
 * - by name, always and offline: work titles and unit labels, from the
 *   catalog;
 * - in the text, offline, in every sefer on the phone: a text pack brings
 *   its search index, and a sefer saved on the phone gets one the phone
 *   builds (saveSefer.ts); Android's own SQLite queries both. The snippet
 *   is cut from the text itself.
 */

export interface NameHit {
  work: CatalogWork;
  unit?: CatalogUnit;
}

export interface TextHit {
  work: CatalogWork;
  unit: CatalogUnit;
  source: number;
  snippet: string | null;
}

function matches(text: string, words: string[]): boolean {
  const normal = normalizeSearchText(text);
  return words.every((word) => normal.includes(word));
}

/** Works and units whose name holds every word of the query (niqqud, geresh and case ignored). */
export function searchNames(works: CatalogWorksIndex, contentsOf: (workId: string) => CatalogWorkContents | null, query: string, limit = 60): NameHit[] {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const hits: NameHit[] = [];
  for (const work of works.works) if (matches(`${work.title.he} ${work.title.en}`, words)) hits.push({ work });
  for (const work of works.works) {
    if (!work.units) continue;
    const contents = contentsOf(work.id);
    for (const unit of contents?.units ?? []) {
      if (hits.length >= limit) return hits;
      if (matches(`${work.title.he} ${work.title.en} ${unit.label} ${unit.labelEn ?? ''}`, words)) hits.push({ work, unit });
    }
  }
  return hits.slice(0, limit);
}

/** The seforim whose search index is on the phone: work id -> the index file. A pack's index wins over one the phone built. */
export async function heldSearchIndexes(): Promise<Map<string, string>> {
  const held = await readHeldObjects();
  const indexes = await savedSearchIndexes();
  for (const object of Object.values(held)) {
    if (object.kind === 'search' && object.collection === 'works' && object.itemId) indexes.set(object.itemId, object.file);
  }
  return indexes;
}

/**
 * The query in the text of every sefer on the phone, in reading order
 * within each sefer. Snippets are made for the first `snippets` hits.
 */
export async function searchTexts(
  native: PacksNativeModule,
  works: CatalogWorksIndex,
  contentsOf: (workId: string) => CatalogWorkContents | null,
  query: string,
  options: { perWork?: number; snippets?: number } = {},
): Promise<TextHit[]> {
  const match = searchIndexQuery(query);
  if (!match) return [];
  const indexes = await heldSearchIndexes();
  const hits: TextHit[] = [];
  for (const work of works.works) {
    const file = indexes.get(work.id);
    const contents = file ? contentsOf(work.id) : null;
    if (!file || !contents) continue;
    const units = new Map(contents.units.map((u) => [u.id, u]));
    let rows: Array<{ unit: string; source: number }>;
    try {
      rows = await native.searchIndex(file, match, options.perWork ?? 50);
    } catch {
      continue;
    }
    for (const row of rows) {
      const unit = units.get(row.unit);
      if (unit) hits.push({ work, unit, source: row.source, snippet: null });
    }
  }
  const snippets = options.snippets ?? 30;
  for (const hit of hits.slice(0, snippets)) {
    const edition = hit.unit.editions.find((e) => e.source === hit.source);
    const html = edition ? await readUnitTextFile(hit.work.id, hit.unit.id, edition) : null;
    // With no text on the phone there is no snippet; the hit still stands.
    if (html !== null) hit.snippet = snippetAround(textObjectPlainText(html), query);
  }
  return hits;
}
