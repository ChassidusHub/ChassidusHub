import { KIND, type Hit } from './names.js';

/**
 * Names found as the person types, from the catalog snapshot the browser
 * already holds: no server, no wait, as the reader app's search does
 * (reader/packages/app-core/src/seforim/searchNames.ts). Only names and
 * occasions are found here; the words inside the texts still come from the
 * server, below them.
 *
 * The snapshot is "Fast site: catalog snapshot"'s (studio/plans/www-instant.md,
 * item A; its format is studio/plans/catalog-snapshot-format.md). When there
 * is none, or it does not come, the box asks the server for its
 * suggestions, as before. Everything this file knows of the
 * snapshot's shape is in `namesOf`, so a change to the format is a change
 * there only.
 */

/** The snapshot's small manifest, at the site's own address (server/catalog.ts): its version, and which file holds its names. Kept a minute; the names file for good. */
export const MANIFEST = '/_/catalog/manifest.json';

/** Where a file the manifest names is read, at the site's own address. */
export const fileAt = (file: string) => `/_/catalog/${encodeURIComponent(file)}`;

/**
 * One row of the snapshot's names: what it is, its Hebrew and English
 * names, the name of what it is in (the sefer of a volume or unit), its
 * path, and for a farbrengen its Hebrew date.
 */
export type NameRow = [kind: string, title: string, titleEn: string | null, parent: string | null, path: string, date?: string | null];

/** The names part of the snapshot (names.<hash>.json), as this file reads it. */
export interface NamesFile {
  format: number;
  names: NameRow[];
}

/** The parts of the manifest this file reads. */
interface Manifest {
  format: number;
  version: string;
  names?: { file: string };
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

const RANK: Record<string, number> = { sefer: 0, shelf: 0, volume: 1, maamar: 2, sicha: 2, letter: 2, chapter: 2, siman: 2, farbrengen: 3, event: 3 };

/** The snapshot's names as an index; built once a version. */
export function namesOf(file: NamesFile, version: string): NameIndex {
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
  return { version, entries };
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

/** An answer's JSON, or null when it is not one; the body of a refusal is let go, not left hanging. */
async function jsonOf<T>(answer: Response): Promise<T | null> {
  if (answer.ok) return answer.json() as Promise<T>;
  await answer.body?.cancel();
  return null;
}

/**
 * The names, read and indexed: the manifest, then the names file it points
 * to (immutable, so the browser and the service worker keep it). Null when
 * there is no snapshot yet or it did not come. Run in the names worker
 * (names.worker.ts), never on the page itself: the file is about 8 MB of
 * JSON (#272), and reading it on a phone's main thread would freeze the box.
 */
export async function readNames(): Promise<NameIndex | null> {
  try {
    const manifest = await fetch(MANIFEST).then((answer) => jsonOf<Manifest>(answer));
    // A format this page does not know is left alone: the box asks the server, as before.
    if (manifest?.format !== 1 || !manifest.names?.file) return null;
    const file = await fetch(fileAt(manifest.names.file)).then((answer) => jsonOf<NamesFile>(answer));
    return file?.format === 1 && Array.isArray(file.names) ? namesOf(file, manifest.version) : null;
  } catch {
    return null;
  }
}

/** The names, as the page asks them: each search answered in the names worker. */
export interface NameFinder {
  version: string;
  find(query: string, limit?: number): Promise<Hit[]>;
}

/** What the page and the names worker say to each other. */
export type ToNames = { find: number; query: string; limit?: number };
export type FromNames = { ready: string | null } | { found: number; hits: Hit[] };

let loading: Promise<NameFinder | null> | null = null;

/**
 * The names, once a visit, read and searched in a worker of their own so the
 * page stays free to answer the person while 8 MB arrive and are indexed.
 * Asked for only once the page is idle, so the names never hold up its
 * frame or its first answers. Null when there is no snapshot (or no worker);
 * until the names are ready, the box asks the server, as before.
 */
export function loadNames(): Promise<NameFinder | null> {
  loading ??= new Promise<NameFinder | null>((resolve) => {
    if (typeof Worker === 'undefined') return resolve(null);
    const idle = (start: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2000 }) : setTimeout(start, 500));
    idle(() => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./names.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        return resolve(null);
      }
      const waiting = new Map<number, (hits: Hit[]) => void>();
      let next = 0;
      worker.onerror = () => resolve(null);
      worker.onmessage = ({ data }: MessageEvent<FromNames>) => {
        if ('ready' in data) {
          if (data.ready === null) {
            worker.terminate();
            return resolve(null);
          }
          const version = data.ready;
          return resolve({
            version,
            find: (query, limit) =>
              new Promise((found) => {
                const id = ++next;
                waiting.set(id, found);
                worker.postMessage({ find: id, query, limit } satisfies ToNames);
              }),
          });
        }
        waiting.get(data.found)?.(data.hits);
        waiting.delete(data.found);
      };
    });
  });
  return loading;
}
