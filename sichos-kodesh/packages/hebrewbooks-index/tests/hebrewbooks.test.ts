import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zstdCompressSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildShelf, compareVolumes, readCatalog, seriesKey, shelfAuthorOf, splitTitle, volumeNumbers } from '../src/index.js';
import type { HebrewBooksRow } from '../src/index.js';

const REBBE = 'שניאורסאהן - מנחם מענדל בן לוי יצחק (אדמו"ר מליובאוויטש)';
const RASHAB = 'שניאורסאהן - שלום דובער בן שמואל (אדמו"ר רש"ב)';
const ALTER_REBBE = 'שניאור זלמן בן ברוך (אדמו"ר הזקן)';

// Rows in the catalog's shape; the titles follow its patterns.
const ROWS: Array<[number, string, string | null, string | null, string | null, number | null, string]> = [
  [14925, 'לקוטי שיחות - ב (במדבר - דברים)', REBBE, 'ניו יורק', null, 470, '[]'],
  [14924, 'לקוטי שיחות - א (בראשית - שמות - ויקרא)', REBBE, 'ניו יורק', null, 306, '[]'],
  [15859, 'ליקוטי שיחות - א (בראשית - שמות - ויקרא)', REBBE, 'ניו יורק', null, 306, '[]'],
  [25033, 'תורת מנחם התוועדויות - חלק א - תש"י', REBBE, null, null, 222, '[]'],
  [25099, 'תורת מנחם התוועדויות לה - תשכ"ג (חלק ראשון)', REBBE, null, 'תשסא', 400, '[]'],
  [15729, "ספר המאמרים תרנ''ט", RASHAB, 'ניו יורק', 'תשכז', 300, '[]'],
  [15730, 'ספר המאמרים תרמ"ג', RASHAB, 'ניו יורק', 'שיחות קודש - ספר', 250, '[]'],
  [58000, 'אגרות קודש (אדמו"ר מוהרש"ב) ב', RASHAB, null, null, 400, '[]'],
  [58001, 'אגרות קודש (אדמו"ר מוהרש"ב) א', RASHAB, null, null, 380, '[]'],
  [43302, 'היום יום', `${REBBE}; זליגסון`, 'ברוקלין', null, 131, '[]'],
  [31632, 'אגרות קודש (אדמו"ר הזקן - האמצעי - הצמח צדק) - חלק א', ALTER_REBBE, 'נ.י.', null, 541, '[]'],
  [26000, 'קובץ הערות התמימים ואנ"ש', 'ישיבת תומכי תמימים ליובאוויטש מאריסטאן', null, null, 80, '[]'],
  [27000, 'אוצר סיפורי חב"ד - חלק ו', 'מאן דהו', null, null, 200, '["חבד"]'],
  // Not Chabad: another author's Toras Menachem.
  [7531, 'תורת מנחם', 'שור - מנחם מנדל', 'מונקאטש', 'תרסג', 97, '[]'],
];

let dir: string;

function catalogDb(): string {
  const file = join(dir, 'catalog.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE hebrew_books (id_book INTEGER PRIMARY KEY, title TEXT, author TEXT, printing_place TEXT, printing_year TEXT, pub_date INTEGER, pages INTEGER, tags TEXT);
           CREATE TABLE db_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
           INSERT INTO db_meta VALUES ('version', '9');`);
  const insert = db.prepare('INSERT INTO hebrew_books VALUES (?, ?, ?, ?, ?, NULL, ?, ?)');
  for (const row of ROWS) insert.run(...row);
  db.close();
  return file;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hebrewbooks-test-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('reading the catalog', () => {
  it('reads the .db and the .db.zst the release ships alike', () => {
    const db = catalogDb();
    const zst = join(dir, 'otzar-HB_catalog.db.zst');
    writeFileSync(zst, zstdCompressSync(readFileSync(db)));
    const plain = readCatalog(db);
    expect(plain.version).toBe('9');
    expect(plain.rows).toHaveLength(ROWS.length);
    expect(plain.rows.find((r) => r.id === 27000)!.tags).toEqual(['חבד']);
    expect(readCatalog(zst)).toEqual(plain);
  });
});

describe('titles', () => {
  it('splits a series from its volume, however the catalog writes it', () => {
    expect(splitTitle('לקוטי שיחות - א (בראשית - שמות - ויקרא)')).toMatchObject({ series: 'לקוטי שיחות', volume: 'א (בראשית - שמות - ויקרא)' });
    expect(splitTitle("ספר המאמרים תרנ''ט")).toMatchObject({ series: 'ספר המאמרים', volume: 'תרנ״ט' });
    expect(splitTitle('אגרות קודש (אדמו"ר מוהרש"ב) ג')).toMatchObject({ series: 'אגרות קודש (אדמו״ר מוהרש״ב)', volume: 'ג' });
    expect(splitTitle('אגרות קודש (אדמו"ר הזקן - האמצעי - הצמח צדק) - חלק א')).toMatchObject({ series: 'אגרות קודש (אדמו״ר הזקן - האמצעי - הצמח צדק)', volume: 'חלק א' });
    expect(splitTitle('תורת מנחם התוועדויות תשמ"ה - חלק ב')).toMatchObject({ series: 'תורת מנחם התוועדויות', volume: 'תשמ״ה - חלק ב' });
    expect(splitTitle('ספר השיחות תשמ"ח ח"א')).toMatchObject({ series: 'ספר השיחות', volume: 'תשמ״ח ח״א' });
    // A title that only looks numbered stays whole.
    expect(splitTitle('היום יום')).toMatchObject({ series: 'היום יום', volume: null });
    expect(splitTitle('קונטרס יב')).toMatchObject({ series: 'קונטרס יב', volume: null });
  });

  it('matches spelling variants to one series', () => {
    expect(seriesKey('ליקוטי שיחות')).toBe(seriesKey('לקוטי שיחות'));
    expect(seriesKey('אגרות קודש (אדמו"ר האמצעי)')).toBe(seriesKey('אגרות קודש ( אדמו״ר האמצעי )'));
  });

  it('orders volumes by their numbers', () => {
    expect(volumeNumbers('תשמ״ה - חלק ב')).toEqual([745, 2]);
    expect(volumeNumbers('ח״ג (תשמ״ה - תש״נ)')).toEqual([3, 745, 750]);
    const volumes = ['יא', 'ב', 'חלק א', undefined, 'כ״א'];
    expect(volumes.sort(compareVolumes)).toEqual(['חלק א', 'ב', 'יא', 'כ״א', undefined]);
  });
});

describe('the shelf', () => {
  const rows = (): HebrewBooksRow[] => readCatalog(catalogDb()).rows;

  it('keeps the Rebbeim and the Chabad books, by the first author, and leaves the rest', () => {
    expect(shelfAuthorOf({ author: `${ALTER_REBBE}; אשכנזי - מרדכי שמואל`, tags: [] })).toBe('alter-rebbe');
    expect(shelfAuthorOf({ author: 'מאן דהו', tags: ['חבד'] })).toBeNull();
    expect(shelfAuthorOf({ author: 'שור - מנחם מנדל', tags: [] })).toBeUndefined();
    const shelf = buildShelf(rows(), '9');
    expect(shelf.catalogVersion).toBe('9');
    expect(shelf.authors.map((a) => a.authorId)).toEqual(['alter-rebbe', 'rebbe-rashab', 'the-rebbe', null]);
    expect(JSON.stringify(shelf)).not.toContain('7531');
  });

  it('gathers a sefer\'s volumes in order, the largest series first', () => {
    const rebbe = buildShelf(rows(), '9').authors.find((a) => a.authorId === 'the-rebbe')!;
    expect(rebbe.series.map((s) => [s.title, s.scans.length])).toEqual([
      ['לקוטי שיחות', 3],
      ['תורת מנחם התוועדויות', 2],
      ['היום יום', 1],
    ]);
    const ls = rebbe.series[0]!;
    expect(ls.key).toBe('לקוטי שיחות');
    expect(ls.scans.map((s) => s.id)).toEqual([14924, 15859, 14925]);
    expect(ls.scans[0]).toEqual({ id: 14924, title: 'לקוטי שיחות - א (בראשית - שמות - ויקרא)', volume: 'א (בראשית - שמות - ויקרא)', printed: 'ניו יורק', pages: 306 });
    // A bare numeral after a known series is its volume.
    expect(rebbe.series[1]!.scans.map((s) => s.volume)).toEqual(['חלק א - תש״י', 'לה - תשכ״ג (חלק ראשון)']);
    expect(rebbe.series[1]!.scans[1]!.printed).toBe('תשס״א');
  });

  it('keeps a printing year only when it is one', () => {
    const rashab = buildShelf(rows(), '9').authors.find((a) => a.authorId === 'rebbe-rashab')!;
    const maamarim = rashab.series.find((s) => s.title === 'ספר המאמרים')!;
    expect(maamarim.scans.map((s) => [s.volume, s.printed])).toEqual([
      ['תרמ״ג', 'ניו יורק'],
      ['תרנ״ט', 'ניו יורק, תשכ״ז'],
    ]);
    expect(rashab.series.find((s) => s.title.startsWith('אגרות'))!.scans.map((s) => s.volume)).toEqual(['א', 'ב']);
  });
});
