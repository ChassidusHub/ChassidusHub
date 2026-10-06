import type { CatalogUnit, CatalogWork, CatalogWorkContents, CatalogWorksIndex } from '@chassidushub-reader/catalog';
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

/** A word of the query found in a name: a whole word when it is short (a chapter's letter, א or יב), else anywhere in it. */
function hasWord(normal: string, tokens: ReadonlySet<string>, word: string): boolean {
  return word.length <= 2 ? tokens.has(word) : normal.includes(word);
}

function matches(text: string, words: string[]): boolean {
  const normal = normalizeSearchText(text);
  const tokens = new Set(normal.split(' '));
  return words.every((word) => hasWord(normal, tokens, word));
}

/**
 * Works and units whose name holds every word of the query (niqqud, geresh
 * and case ignored). A query that is only a sefer's name finds the sefer,
 * not every chapter in it; its chapters are listed when the query says more
 * than the name - תניא finds the Tanya, תניא פרק לב its chapter.
 */
export function searchNames(works: CatalogWorksIndex, contentsOf: (workId: string) => CatalogWorkContents | null, query: string, limit = 60): NameHit[] {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const hits: NameHit[] = [];
  for (const work of works.works) if (matches(`${work.title.he} ${work.title.en}`, words)) hits.push({ work });
  for (const work of works.works) {
    if (!work.units) continue;
    // The words the sefer's own name doesn't account for: these must name the chapter.
    const title = normalizeSearchText(`${work.title.he} ${work.title.en}`);
    const titleTokens = new Set(title.split(' '));
    const rest = words.filter((word) => !hasWord(title, titleTokens, word));
    if (rest.length === 0) continue;
    const contents = contentsOf(work.id);
    for (const unit of contents?.units ?? []) {
      if (hits.length >= limit) return hits;
      if (matches(`${unit.label} ${unit.labelEn ?? ''}`, rest)) hits.push({ work, unit });
    }
  }
  return hits.slice(0, limit);
}
