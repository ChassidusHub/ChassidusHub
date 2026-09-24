import type { CatalogScan, CatalogScanSeries, CatalogShelf } from '@sichos-kodesh/catalog';
import { normalizeSearchText } from '../search/normalizeSearchText.js';

/**
 * The HebrewBooks shelf, in both apps: each sefer's scans on its own
 * screen, and every other Chabad book on HebrewBooks by author. A scan is
 * a link to its page on hebrewbooks.org (HebrewBooks' terms allow linking
 * to a book's page, not to its PDF), never a copy.
 */

/** A book's page on HebrewBooks. */
export function hebrewBooksUrl(id: number): string {
  return `https://hebrewbooks.org/${id}`;
}

/** A work's series on the shelf, in the shelf's order; empty when HebrewBooks has none of it. */
export function workScans(shelf: CatalogShelf | null, workId: string): CatalogScanSeries[] {
  if (!shelf) return [];
  return shelf.authors.flatMap((author) => author.series.filter((series) => series.workId === workId));
}

/**
 * An author's series that belong to no sefer in the catalog: what the
 * author's "more on HebrewBooks" lists (the rest open from their sefer).
 * `authorId` null is the Chabad books by anyone else.
 */
export function authorShelf(shelf: CatalogShelf | null, authorId: string | null): CatalogScanSeries[] {
  const author = shelf?.authors.find((a) => a.authorId === authorId);
  return author ? author.series.filter((series) => !series.workId) : [];
}

/** How many scans a list of series holds. */
export function scanCount(series: readonly CatalogScanSeries[]): number {
  return series.reduce((n, s) => n + s.scans.length, 0);
}

/** What a scan is called within its series: its volume, or its title when it has none. */
export function scanLabel(scan: CatalogScan): string {
  return scan.volume ?? scan.title;
}

/** The series whose title, or one of whose scans, holds every word of the query (niqqud, quotes and case ignored). */
export function searchShelf(series: readonly CatalogScanSeries[], query: string): CatalogScanSeries[] {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...series];
  const matches = (text: string) => {
    const normal = normalizeSearchText(text);
    return words.every((word) => normal.includes(word));
  };
  const hits: CatalogScanSeries[] = [];
  for (const s of series) {
    if (matches(s.title)) {
      hits.push(s);
      continue;
    }
    const scans = s.scans.filter((scan) => matches(`${scan.title} ${scan.volume ?? ''}`));
    if (scans.length > 0) hits.push({ ...s, scans });
  }
  return hits;
}
