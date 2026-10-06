import type { CatalogScanSeries, CatalogShelf } from '@chassidushub-reader/catalog';
// The node-free entry: the apps bundle this package (editionUrl), so it may not reach node:sqlite.
import { seriesKey } from '@chassidushub-reader/hebrewbooks-index/series';
import type { HebrewBooksShelf } from '@chassidushub-reader/hebrewbooks-index';
import { HEBREWBOOKS_SERIES } from './registry/hebrewbooks.js';
import type { Work } from './types.js';

/**
 * Places the HebrewBooks shelf's series with the registry's works: a series
 * is a work's when it carries the work's own Hebrew title, or one of the
 * names hebrewbooks.ts gives it, and is by the same author. The shelf keeps
 * every series either way; a placed one also opens from its work's screen.
 */

export interface PlacedShelf {
  shelf: CatalogShelf;
  /** Each work's series, in the shelf's order. */
  byWork: Map<string, CatalogScanSeries[]>;
  /** Names in hebrewbooks.ts that matched no series: a renamed title or a catalog that changed. */
  unmatched: string[];
}

export function placeShelf(shelf: HebrewBooksShelf, works: readonly Work[]): PlacedShelf {
  const byWork = new Map<string, CatalogScanSeries[]>();
  const used = new Set<string>();
  const authors: CatalogShelf['authors'] = shelf.authors.map((author) => {
    const names = new Map<string, string>();
    if (author.authorId) {
      for (const work of works) {
        if (!work.authors.includes(author.authorId)) continue;
        for (const name of HEBREWBOOKS_SERIES[work.id] ?? []) names.set(seriesKey(name), work.id);
        if (!names.has(seriesKey(work.title.he))) names.set(seriesKey(work.title.he), work.id);
      }
    }
    const series = author.series.map((s) => {
      const out: CatalogScanSeries = { title: s.title, scans: s.scans };
      const workId = names.get(s.key);
      if (workId) {
        out.workId = workId;
        used.add(`${workId}\u0000${s.key}`);
        byWork.set(workId, [...(byWork.get(workId) ?? []), out]);
      }
      return out;
    });
    return { authorId: author.authorId, series };
  });
  const unmatched = Object.entries(HEBREWBOOKS_SERIES).flatMap(([workId, names]) => names.filter((name) => !used.has(`${workId}\u0000${seriesKey(name)}`)).map((name) => `${workId}: ${name}`));
  return { shelf: { catalogVersion: shelf.catalogVersion, authors }, byWork, unmatched };
}
