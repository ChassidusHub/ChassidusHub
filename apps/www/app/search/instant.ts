import { KIND, type Hit } from './names';

/**
 * Names found as the person types, from the catalog snapshot the browser
 * already holds: no server, no wait, as the reader app's search does
 * (reader/packages/app-core/src/seforim/searchNames.ts). Only names and
 * occasions are found here; the words inside the texts still come from the
 * server, below them.
 *
 * The snapshot is "Fast site: catalog snapshot"'s (studio/plans/www-instant.md,
 * item A). Until it is served, its manifest answers 404 and the box asks the
 * server for its suggestions, as before. Everything this file knows of the
 * snapshot's shape is in `namesOf`, so a change to the format is a change
 * there only.
 */

/** The snapshot's small manifest: its version, and where its names are. Never cached long; the names file is. */
export const MANIFEST = '/catalog/manifest.json';

/**
 * One row of the snapshot's names: what it is, its Hebrew and English
 * names, the name of what it is in (the sefer of a volume or unit), its
 * path, and for a farbrengen its Hebrew date.
 */
export type NameRow = [kind: string, title: string, titleEn: string | null, parent: string | null, path: string, date?: string | null];

/** The names part of the snapshot, as this file reads it. */
export interface NamesFile {
  version: string;
  names: NameRow[];
}

interface Entry {
  hit: Hit;
  /** The entry's own name (and date), normalized. */
  own: string;
  ownWords: Set<string>;
  /** What it is in, normalized: words the query spends on the sefer's name. */
  parent: string;
  parentWords: Set<string>;
  /** Lower comes first: sefarim, then volumes and units, then farbrengens. */
  rank: number;
}

export interface NameIndex {
  version: string;
  entries: Entry[];
}

/**
 * Text as names are compared: no niqqud, no geresh, gershayim or quotes
 * (ה"ה and ה״ה are both הה), lower case, anything else a space. The same as
 * the reader app's normalizeSearchText, so both find the same names.
 */
export function normalize(text: string): string {
  return text
    .replace(/[֑-ׇֽֿׁׂׅׄ]/g, '')
    .replace(/[׳״"'`‘’“”]/g, '')
    .toLowerCase()
    .replace(/[^0-9a-zÀ-ɏא-תװ-ײ]+/g, ' ')
    .trim();
}

const RANK: Record<string, number> = { sefer: 0, shelf: 0, book: 1, volume: 1, maamar: 2, sicha: 2, letter: 2, chapter: 2, siman: 2, farbrengen: 3, event: 3 };

/** The snapshot's names as an index; built once a version. */
export function namesOf(file: NamesFile): NameIndex {
  const entries = file.names.map(([kind, title, titleEn, parent, path, date]): Entry => {
    const own = normalize([title, titleEn, date].filter(Boolean).join(' '));
    const up = normalize(parent ?? '');
    return {
      // A farbrengen with no name of its own is its date.
      hit: { kind: KIND[kind] ?? '', title: title || date || '', sub: [title ? date : null, parent].filter(Boolean).join(' · '), to: path },
      own,
      ownWords: new Set(own.split(' ')),
      parent: up,
      parentWords: new Set(up.split(' ')),
      rank: RANK[kind] ?? 2,
    };
  });
  return { version: file.version, entries };
}

/** A word of the query found in a name: a whole word when it is short (a volume's letter, א or יב), else anywhere in it. */
const has = (text: string, words: Set<string>, word: string) => (word.length <= 2 ? words.has(word) : text.includes(word));

/**
 * The names holding every word of the query, best first. Words the
 * sefer's own name accounts for may be spent on it, but at least one must
 * name the entry itself: ליקוטי שיחות finds the sefer, not its every
 * volume; ליקוטי שיחות יב finds volume יב.
 */
export function findNames(index: NameIndex, query: string, limit = 8): Hit[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const found: { entry: Entry; score: number }[] = [];
  for (const entry of index.entries) {
    let own = 0;
    let all = true;
    for (const word of words) {
      if (has(entry.own, entry.ownWords, word)) own++;
      else if (!has(entry.parent, entry.parentWords, word)) {
        all = false;
        break;
      }
    }
    if (!all || own === 0) continue;
    // A name that starts with what was typed, and a short one, before the rest.
    const starts = entry.own.startsWith(words[0]!) ? 0 : 1;
    found.push({ entry, score: entry.rank * 4 + starts * 2 + (own === words.length ? 0 : 1) });
  }
  found.sort((a, b) => a.score - b.score || a.entry.own.length - b.entry.own.length);
  return found.slice(0, limit).map(({ entry }) => entry.hit);
}

let loading: Promise<NameIndex | null> | null = null;

/**
 * The names, read once a visit: the manifest, then the names file it
 * points to (immutable, so the browser and the service worker keep it).
 * Null when there is no snapshot yet or it did not come; the box then asks
 * the server, as before.
 */
export function loadNames(): Promise<NameIndex | null> {
  loading ??= (async () => {
    try {
      const manifest = await fetch(MANIFEST).then((answer) => (answer.ok ? (answer.json() as Promise<{ names?: string }>) : null));
      if (!manifest?.names) return null;
      const file = await fetch(manifest.names).then((answer) => (answer.ok ? (answer.json() as Promise<NamesFile>) : null));
      return file?.names ? namesOf(file) : null;
    } catch {
      return null;
    }
  })();
  return loading;
}
