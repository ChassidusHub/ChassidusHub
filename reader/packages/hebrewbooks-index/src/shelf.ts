import { compareVolumes, hebrewQuotes, seriesKey, splitTitle } from './series.js';
import type { HebrewBooksRow, HebrewBooksShelf, ShelfAuthor, ShelfScan, ShelfSeries } from './types.js';

/**
 * The Chabad shelf of HebrewBooks (docs/chabad-library-plan.md, section 2a
 * and WP19): every book by one of the Rebbeim (or the Baal Shem Tov and the
 * Maggid), and every other book the catalog tags חב״ד or a Chabad yeshiva
 * or institution published. It keeps bibliographic facts and the book's
 * id - the link is hebrewbooks.org/<id> - and never the scan.
 */

/**
 * The registry's author ids (packages/works' authors.ts), each with how the
 * catalog writes that author. The first author a row names decides; the
 * rest are editors and commentators (`...(אדמו"ר הזקן); אשכנזי - ...`).
 */
const AUTHOR_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['baal-shem-tov', /ישראל בן אליעזר.{0,3}בעש"ט/],
  ['maggid', /(?:דב בר|דוב בער) בן אברהם.*ממזריץ/],
  ['alter-rebbe', /שניאור זלמן בן ברוך/],
  ['mitteler-rebbe', /דובער בן שניאור זלמן/],
  ['tzemach-tzedek', /מנחם מענדל בן שלום שכנא/],
  ['rebbe-maharash', /שמואל בן מנחם מענדל/],
  ['rebbe-rashab', /שלום דובער בן שמואל/],
  ['frierdiker-rebbe', /יוסף יצחק בן שלום דובער|^יוסף יצחק שניאורסאהן$/],
  ['the-rebbe', /מנחם מענדל בן לוי יצחק/],
];

/** The shelf's author order: the registry's, then everyone else. */
export const SHELF_AUTHOR_IDS: readonly string[] = AUTHOR_PATTERNS.map(([id]) => id);

/** A Chabad yeshiva, institution or publisher, as the catalog names them. */
const CHABAD_PUBLISHER = /תומכי.?תמימים|ליובאוויטש|ליובויץ|חב"?ד/;

/** Whose shelf a book is on: an author id, null for the other Chabad books, undefined when it is not a Chabad book. */
export function shelfAuthorOf(row: Pick<HebrewBooksRow, 'author' | 'tags'>): string | null | undefined {
  const first = row.author?.split(';')[0]?.trim() ?? '';
  for (const [id, pattern] of AUTHOR_PATTERNS) if (pattern.test(first)) return id;
  if (row.tags.some((tag) => tag === 'חבד' || tag === 'חב"ד')) return null;
  if (row.author && CHABAD_PUBLISHER.test(row.author)) return null;
  return undefined;
}

/** A printing year as a Hebrew year where it is one (`תשכז` is `תשכ״ז`); anything else is dropped. */
function printedYear(value: string | null): string | null {
  if (!value) return null;
  const year = hebrewQuotes(value);
  if (/^[א-ת]{2,5}$/.test(year)) return `${year.slice(0, -1)}״${year.slice(-1)}`;
  if (/^(?:ה׳)?[א-ת]{1,4}״[א-ת]$/.test(year) || /^1[5-9]\d\d$|^20\d\d$/.test(year)) return year;
  return null;
}

function scanOf(row: HebrewBooksRow, volume: string | null, title: string): ShelfScan {
  const scan: ShelfScan = { id: row.id, title };
  if (volume) scan.volume = volume;
  const printed = [row.printingPlace ? hebrewQuotes(row.printingPlace) : null, printedYear(row.printingYear)].filter(Boolean).join(', ');
  if (printed) scan.printed = printed;
  if (row.pages) scan.pages = row.pages;
  return scan;
}

/** The title most of a series' scans use (the first to reach the top count, in id order). */
function commonTitle(titles: readonly string[]): string {
  const counts = new Map<string, number>();
  let best = titles[0]!;
  for (const title of titles) {
    const count = (counts.get(title) ?? 0) + 1;
    counts.set(title, count);
    if (count > (counts.get(best) ?? 0)) best = title;
  }
  return best;
}

export function buildShelf(rows: readonly HebrewBooksRow[], catalogVersion: string): HebrewBooksShelf {
  const byAuthor = new Map<string | null, Map<string, { titles: string[]; scans: ShelfScan[] }>>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const authorId = shelfAuthorOf(row);
    if (authorId === undefined) continue;
    const { title, series, volume } = splitTitle(row.title);
    const key = seriesKey(series);
    if (!byAuthor.has(authorId)) byAuthor.set(authorId, new Map());
    const group = byAuthor.get(authorId)!;
    if (!group.has(key)) group.set(key, { titles: [], scans: [] });
    const entry = group.get(key)!;
    entry.titles.push(series);
    entry.scans.push(scanOf(row, volume, title));
  }

  // A bare numeral after a series the author already has is a volume of it
  // (`תורת מנחם התוועדויות לה - תשכ"ג` is volume 35 of Toras Menachem).
  for (const group of byAuthor.values()) {
    for (const [key, entry] of [...group.entries()]) {
      const match = /^(.+) ([א-ת]{1,2})$/.exec(key);
      const base = match ? group.get(match[1]!) : undefined;
      if (!match || !base || base === entry) continue;
      for (const scan of entry.scans) scan.volume = scan.volume ? `${match[2]} - ${scan.volume}` : match[2]!;
      base.scans.push(...entry.scans);
      base.titles.push(...entry.titles.map(() => base.titles[0]!));
      group.delete(key);
    }
  }

  const authors: ShelfAuthor[] = [];
  for (const authorId of [...SHELF_AUTHOR_IDS, null]) {
    const group = byAuthor.get(authorId);
    if (!group) continue;
    const series: ShelfSeries[] = [...group.entries()].map(([key, { titles, scans }]) => ({
      key,
      title: commonTitle(titles),
      scans: scans.sort((a, b) => compareVolumes(a.volume, b.volume) || a.id - b.id),
    }));
    // The largest series first (a sefer's many volumes), then by title.
    series.sort((a, b) => b.scans.length - a.scans.length || a.title.localeCompare(b.title, 'he'));
    authors.push({ authorId, series });
  }
  return { catalogVersion, authors };
}

/** How many scans a shelf holds, all authors together. */
export function shelfSize(shelf: HebrewBooksShelf): number {
  return shelf.authors.reduce((n, author) => n + author.series.reduce((m, s) => m + s.scans.length, 0), 0);
}
