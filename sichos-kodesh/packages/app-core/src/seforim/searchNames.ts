import type { CatalogUnit, CatalogWork, CatalogWorkContents, CatalogWorksIndex } from '@sichos-kodesh/catalog';
import { normalizeSearchText } from '../search/normalizeSearchText.js';

/**
 * Searching the seforim by name, in both apps and always offline: work
 * titles and unit labels, from the catalog. (Searching the text itself
 * needs a search index, which only the phone holds.)
 */

export interface NameHit {
  work: CatalogWork;
  unit?: CatalogUnit;
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
