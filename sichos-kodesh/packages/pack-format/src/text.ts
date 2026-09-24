import type { CatalogWork, CatalogWorkContents } from '@sichos-kodesh/catalog';
import { normalizeSearchText } from '@sichos-kodesh/app-core';
import type { ObjectRef, PackEntry, PackScope } from './manifest.js';

/** Lives in app-core, so both apps can search without the pack format. */
export { normalizeSearchText };

/**
 * Text packs (catalog schema 3): one pack per work, carrying every text of
 * it that may ship and the work's search index.
 * - Each unit is an entry `<work id>/<unit id>` in the `works` collection,
 *   with one `text` ref per kept edition.
 * - The work itself is an entry `<work id>` with one `search` ref: an
 *   SQLite FTS4 database the phone queries offline (see SEARCH_INDEX_SQL).
 *
 * The phone reads a text by its sha256, from the catalog's unit edition,
 * so a text's `sourceId` only has to be unique and a safe file name.
 */

/** The version of the search database's layout; the phone skips an index of a layout it does not know. */
export const SEARCH_INDEX_FORMAT = 1;

/**
 * The search database:
 * - `meta`: format, work, catalog version;
 * - `rows`: one per unit and edition, with the unit id and the edition's
 *   source index;
 * - `search`: a contentless FTS4 table over the same rows (docid = rows.id),
 *   indexing the normalised title and body (normalizeSearchText), which the
 *   `simple` tokenizer splits on spaces.
 *
 * Contentless keeps the index small. It stores no copy of the text, which
 * the phone already holds as the text objects, and the phone makes its
 * snippets from those. FTS4, not FTS5, because Android's own SQLite always
 * has FTS4, so the phone needs no SQLite of its own. A query:
 *
 *     SELECT rows.unit, rows.source FROM search JOIN rows ON rows.id = search.docid
 *     WHERE search MATCH ? ORDER BY rows.id LIMIT ?
 */
export const SEARCH_INDEX_SQL = [
  'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE rows (id INTEGER PRIMARY KEY, unit TEXT NOT NULL, source INTEGER NOT NULL)',
  'CREATE VIRTUAL TABLE search USING fts4(content="", title, body)',
];

/** The query the phone runs, with the FTS query and a row limit as its two parameters. */
export const SEARCH_INDEX_QUERY = 'SELECT rows.unit, rows.source FROM search JOIN rows ON rows.id = search.docid WHERE search MATCH ? ORDER BY rows.id LIMIT ?';

export function workUnitItemId(workId: string, unitId: string): string {
  return `${workId}/${unitId}`;
}

/** A kept text's sourceId: the phone stores it at `texts/work_<work>_<hash prefix>.html`. */
export function workTextSourceId(workId: string, sha256: string): string {
  return `work:${workId}:${sha256.slice(0, 16)}`;
}

export function searchIndexSourceId(workId: string): string {
  return `search:${workId}`;
}

export function workPackScope(work: Pick<CatalogWork, 'id' | 'title'>): PackScope {
  return { kind: 'work', collection: 'works', work: work.id, label: { en: work.title.en, he: work.title.he } };
}

/** Every text of a work that may ship, as pack entries, in the work's order of units. */
export function workTextEntries(work: CatalogWork, contents: CatalogWorkContents): PackEntry[] {
  const entries: PackEntry[] = [];
  for (const unit of contents.units) {
    const refs: ObjectRef[] = [];
    for (const edition of unit.editions) {
      const source = work.sources[edition.source];
      if (!edition.sha256 || edition.bytes === undefined || !source) continue;
      if (source.rights !== 'ship' && source.rights !== 'ship-with-credit') continue;
      const ref: ObjectRef = { sha256: edition.sha256, bytes: edition.bytes, kind: 'text', sourceId: workTextSourceId(work.id, edition.sha256), role: String(edition.source) };
      if (source.version) ref.label = source.version;
      refs.push(ref);
    }
    if (refs.length > 0) entries.push({ collection: 'works', itemId: workUnitItemId(work.id, unit.id), label: unit.label, refs });
  }
  return entries;
}

/** The entry that carries a work's search index. */
export function searchIndexEntry(work: Pick<CatalogWork, 'id' | 'title'>, sha256: string, bytes: number): PackEntry {
  return { collection: 'works', itemId: work.id, label: work.title.he, refs: [{ sha256, bytes, kind: 'search', sourceId: searchIndexSourceId(work.id), role: 'search' }] };
}

/** The letters that attach to the front of a Hebrew word: ו ה ב כ ל מ ש. */
const HEBREW_PREFIXES = '\u05D5\u05D4\u05D1\u05DB\u05DC\u05DE\u05E9';
const STACKING_PREFIXES = '\u05D5\u05E9';
const VAV = '\u05D5';
const HEBREW_WORD = /^[\u05D0-\u05EA\u05F0-\u05F2]+$/;

/**
 * Normalised words, each Hebrew one followed by itself without its
 * prefixes. So "הבינוני" and "ובינוני" are found by "בינוני": an index
 * only matches words from their start.
 * - One prefix letter (ו ה ב כ ל מ ש) comes off a word of four letters or
 *   more.
 * - Two come off a word of five or more, when they are one of the pairs
 *   Hebrew stacks: ו or ש, then ה ב כ ל מ ש (וה, שב, ...).
 * That leaves the short words alone (אב, שבת), and a word whose first
 * letters are its own (הבינוני is never cut to ינוני).
 */
export function withHebrewStems(words: string): string {
  const out: string[] = [];
  for (const word of words.split(' ')) {
    if (!word) continue;
    out.push(word);
    if (!HEBREW_WORD.test(word)) continue;
    if (word.length >= 4 && HEBREW_PREFIXES.includes(word[0]!)) {
      out.push(word.slice(1));
      if (word.length >= 5 && STACKING_PREFIXES.includes(word[0]!) && HEBREW_PREFIXES.includes(word[1]!) && word[1] !== VAV) out.push(word.slice(2));
    }
  }
  return out.join(' ');
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** A text object's words, for the index: the heading and the source line left out, the notes kept, Hebrew stems added (withHebrewStems). */
export function textObjectWords(html: string): string {
  return withHebrewStems(
    normalizeSearchText(
      html
        .replace(/<h1>[\s\S]*?<\/h1>/g, ' ')
        .replace(/<footer[\s\S]*?<\/footer>/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
          if (name[0] === '#') {
            const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
          }
          return ENTITIES[name.toLowerCase()] ?? ' ';
        }),
    ),
  );
}

/**
 * A query as the phone sends it to the index: normalised, and each word
 * a prefix (`שכינ*` finds שכינה and שכינתו), all words required. Null when
 * nothing searchable is left.
 */
export function searchIndexQuery(query: string): string | null {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word) => `${word}*`).join(' ');
}
