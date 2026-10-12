import { normalizeSearchText, toHebrewNumeral, unfinal } from '@chassidushub/hebrew';
import type { PageInline, PageSegment, PageVersion } from '@chassidushub/model';
import type { Catalog } from './catalog.js';

/**
 * A sefer's whole subject index on one page, gathered from the index's own
 * pages (one a volume, as the per-volume pages hold them): every topic once,
 * with each volume's places under it, each place its context (the words
 * the index prints beside the page number) and its links, the sicha's PDF
 * at that page and the sicha's own page here. Nothing is stored for it:
 * a fix on the index pages shows here once they change.
 *
 * Words a machine read and no person checked stay labelled (`machine`),
 * volume by volume.
 */

export interface MafteachPlace {
  /** The page the index names, and the last page of a range. */
  page: number;
  to?: number;
  /** The index's own words for what is on that page. */
  context?: string;
  /** The sicha's PDF, the page of the PDF where this place is, and the sicha's name. */
  pdf?: string;
  at?: number;
  sicha?: string;
  /** The sicha's page here, when the catalog has it. */
  text?: string;
}

export interface MafteachVolume {
  volume: number;
  label: string;
  /** The index page of that volume, where its words are fixed. */
  path: string | null;
  /** Read by a machine, and not yet checked by a person. */
  machine: boolean;
  places: MafteachPlace[];
}

export interface MafteachTopic {
  topic: string;
  letter: string;
  volumes: MafteachVolume[];
}

export interface Mafteach {
  index: { id: string; path: string | null; title: unknown };
  /** Each first letter and how many topics under it, in order. */
  letters: Array<{ letter: string; topics: number }>;
  totals: { topics: number; places: number; volumes: number };
  /** The topics asked for: one letter's, or those a search found. */
  topics: MafteachTopic[];
  /** How many topics the letter or the search holds in all; `topics` are those from `offset`, up to `limit` topics or `places` places. */
  found: number;
  offset: number;
  /** The offset of the next topics, or null at the end. */
  next: number | null;
}

interface Built {
  index: Mafteach['index'];
  topics: Array<MafteachTopic & { key: string; words: string }>;
  totals: Mafteach['totals'];
}

const cache = new Map<string, { stamp: string; built: Built }>();

/** How the index is built; raised when that changes, so kept indexes are built again (2: places open their page, #100). */
const BUILD = 2;

/**
 * Where a built index is kept between requests (the API keeps it in R2): a
 * cold Worker reads it rather than building it again, which on the live
 * catalog takes longer than a request may run (issue #104).
 */
export interface MafteachKept {
  get(at: string): Promise<{ stamp: string; built: unknown } | null>;
  put(at: string, value: { stamp: string; built: unknown }): Promise<void>;
}

/** A topic as a key: the same topic printed a little differently in two volumes (quotes, a final letter) meets once. */
const keyOf = (topic: string) => unfinal(normalizeSearchText(topic));
const LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';

/**
 * The index's runs of one volume's paragraph as places: `126 (context). 194.`
 * `textOf` is the page on the site a place opens: by the PDF it links, or by
 * its page alone.
 */
export function placesOf(runs: readonly PageInline[], textOf: (pdf: string, page: number) => string | undefined): MafteachPlace[] {
  const places: MafteachPlace[] = [];
  for (const run of runs) {
    if (!('text' in run)) continue;
    const pages = /^(\d+)(?:-(\d+))?$/.exec(run.text.trim());
    if (pages) {
      const place: MafteachPlace = { page: Number(pages[1]) };
      // A range the reading mangled (337-0) keeps its first page alone.
      if (pages[2] && Number(pages[2]) > place.page) place.to = Number(pages[2]);
      if (run.href) {
        // The index links the reader (`/read?page=&title=&src=`): kept as its parts, the PDF's own address and the page in it.
        const query = new URLSearchParams(run.href.slice(run.href.indexOf('?') + 1));
        const src = query.get('src') ?? '';
        const drive = driveId(src);
        place.pdf = drive ? `https://drive.google.com/file/d/${drive}/view` : src || run.href;
        const at = Number(query.get('page'));
        if (Number.isInteger(at) && at > 1) place.at = at;
        const sicha = query.get('title')?.trim();
        if (sicha) place.sicha = sicha;
      }
      const text = textOf(place.pdf ?? '', place.page);
      if (text) place.text = text;
      places.push(place);
      continue;
    }
    const context = /^\s*\((.*)\)\s*$/s.exec(run.text);
    const last = places[places.length - 1];
    if (context && last && !last.context) last.context = context[1]!.trim();
  }
  return places;
}

/** A Drive file's id, from any of its link shapes (`/file/d/<id>/view`, `open?id=<id>`). */
export function driveId(url: string): string | null {
  return /\/d\/([\w-]{10,})/.exec(url)?.[1] ?? /[?&]id=([\w-]{10,})/.exec(url)?.[1] ?? null;
}

async function build(catalog: Catalog, indexId: string, seferId: string | null): Promise<Built> {
  const [head, units, sichos, pages] = await Promise.all([
    catalog.db.query<{ path: string | null; title: unknown }>(`SELECT e.path, r.data->'title' AS title FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = $1`, [indexId]),
    catalog.db.query<{ path: string | null; position: Array<{ value?: string }> | null; version: PageVersion | null }>(
      `SELECT e.path, r.data->'position' AS position, r.data->'body'->'versions'->0 AS version
       FROM revision r JOIN entity e ON e.id = r.entity_id AND e.main_rev = r.id AND NOT e.deleted
       WHERE r.data->>'work' = $1 AND e.type = 'unit'`,
      [indexId],
    ),
    // The sefer's sichos by their PDF, for each place's link to the sicha's own page.
    seferId
      ? catalog.db.query<{ path: string; url: string }>(
          `SELECT e.path, ed->>'url' AS url
           FROM revision r JOIN entity e ON e.id = r.entity_id AND e.main_rev = r.id AND NOT e.deleted,
                jsonb_array_elements(CASE WHEN jsonb_typeof(r.data->'editions') = 'array' THEN r.data->'editions' ELSE '[]'::jsonb END) ed
           WHERE r.data->>'work' = $1 AND e.type = 'unit' AND e.path IS NOT NULL AND ed->>'kind' = 'pdf'`,
          [seferId],
        )
      : Promise.resolve({ rows: [] as Array<{ path: string; url: string }> }),
    // The sefer's printed pages, where its units are pages (volumes 30-39 of Likkutei Sichos, from Chabad Library, are
    // each page its own unit named by its number): a place opens that page, not the PDF of its sicha (#100).
    seferId
      ? catalog.db.query<{ part: string | null; page: string; path: string }>(
          `SELECT part, label->>'he' AS page, path FROM unit_place
           WHERE work_id = $1 AND path IS NOT NULL AND label->>'he' ~ '^[0-9]+$' ORDER BY ord`,
          [seferId],
        )
      : Promise.resolve({ rows: [] as Array<{ part: string | null; page: string; path: string }> }),
  ]);
  const byPage = new Map<string, string>();
  for (const row of pages.rows) {
    const key = `${row.part}:${Number(row.page)}`;
    if (!byPage.has(key)) byPage.set(key, row.path);
  }
  const byDrive = new Map<string, string>();
  for (const row of sichos.rows) {
    const id = driveId(row.url);
    if (id && !byDrive.has(id)) byDrive.set(id, row.path);
  }
  const textOf = (volume: number) => (pdf: string, page: number) => {
    const exact = byPage.get(`${volume}:${page}`);
    if (exact) return exact;
    const id = driveId(pdf);
    return id ? byDrive.get(id) : undefined;
  };

  const topics = new Map<string, { forms: Map<string, number>; volumes: MafteachVolume[] }>();
  let places = 0;
  const volumes = new Set<number>();
  for (const unit of units.rows) {
    const volume = Number(unit.position?.[0]?.value);
    if (!Number.isInteger(volume) || !unit.version?.segments) continue;
    volumes.add(volume);
    const machineVersion = Boolean(unit.version.origin && !unit.version.origin.checked);
    let topic: string | null = null;
    for (const segment of unit.version.segments as PageSegment[]) {
      const words = (segment.text ?? []).map((run) => ('text' in run ? run.text : '')).join('').trim();
      if (segment.kind === 'heading') {
        topic = words || null;
        continue;
      }
      if (segment.kind !== 'paragraph' || !topic || topic === '(המשך)') continue;
      const found = placesOf(segment.text ?? [], textOf(volume));
      if (!found.length) continue;
      const key = keyOf(topic);
      if (!key) continue;
      const entry = topics.get(key) ?? { forms: new Map<string, number>(), volumes: [] as MafteachVolume[] };
      topics.set(key, entry);
      entry.forms.set(topic, (entry.forms.get(topic) ?? 0) + 1);
      const machine = machineVersion || Boolean(segment.origin && !segment.origin.checked);
      const same = entry.volumes.find((v) => v.volume === volume);
      if (same) {
        same.places.push(...found);
        same.machine ||= machine;
      } else entry.volumes.push({ volume, label: `חלק ${toHebrewNumeral(volume)}`, path: unit.path, machine, places: found });
      places += found.length;
    }
  }
  const built: Built['topics'] = [...topics].map(([key, { forms, volumes: vols }]) => {
    // The form most volumes print; between equals, the plainer (shorter) one, so the page reads the same however the rows come.
    const topic = [...forms].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], 'he'))[0]![0];
    vols.sort((a, b) => a.volume - b.volume);
    const words = normalizeSearchText([topic, ...vols.flatMap((v) => v.places.map((p) => `${p.context ?? ''} ${p.sicha ?? ''}`))].join(' '));
    return { topic, key, letter: LETTERS.includes(key[0]!) ? key[0]! : '#', volumes: vols, words: unfinal(words) };
  });
  built.sort((a, b) => a.key.localeCompare(b.key, 'he'));
  return {
    index: { id: indexId, path: head.rows[0]?.path ?? null, title: head.rows[0]?.title ?? null },
    topics: built,
    totals: { topics: built.length, places, volumes: volumes.size },
  };
}

/** The built index, kept or built now (see `mafteach`); null when there is no such index. */
async function builtIndex(
  catalog: Catalog,
  indexId: string,
  options: { seferId?: string | null; kept?: MafteachKept; stale?: boolean; onBuild?: () => void },
): Promise<Built | null> {
  const seferId = options.seferId ?? null;
  const stamp = await catalog.db.query<{ stamp: string | null }>(
    `SELECT (SELECT max(e.main_rev) FROM entity e WHERE e.id = $1)::text || ':' ||
            coalesce((SELECT max(e.main_rev) FROM unit_place p JOIN entity e ON e.id = p.unit_id WHERE p.work_id = ANY($2)), 0)::text AS stamp`,
    [indexId, seferId ? [indexId, seferId] : [indexId]],
  );
  // The way it is built is part of the stamp: an index kept by an older build is built again.
  const now = stamp.rows[0]?.stamp ? `${BUILD}:${stamp.rows[0].stamp}` : null;
  if (!now) return null;
  const at = `${indexId}-${seferId ?? 'none'}`;
  let hit = cache.get(at);
  if (!hit || hit.stamp !== now) {
    const stored = (await options.kept?.get(at).catch(() => null)) as { stamp: string; built: Built } | null | undefined;
    if (stored && (stored.stamp === now || options.stale)) hit = stored;
    else {
      options.onBuild?.();
      hit = { stamp: now, built: await build(catalog, indexId, seferId) };
      await options.kept?.put(at, hit);
    }
    cache.set(at, hit);
  }
  return hit.built;
}

/**
 * The index at `indexId` (a work whose units are its volumes' index pages),
 * each place linked to the sicha's page in `seferId` when there is one.
 * Built once and kept until an index page or a sicha changes: one small
 * statement answers whether it did, from each unit's place (unit_place),
 * never reading the sefer's versions.
 */
export async function mafteach(
  catalog: Catalog,
  indexId: string,
  options: {
    seferId?: string | null;
    letter?: string;
    q?: string;
    limit?: number;
    places?: number;
    offset?: number;
    /** Where the built index is kept; with `stale`, a kept index a page has changed since is served as it is (the scheduled run builds it again). */
    kept?: MafteachKept;
    stale?: boolean;
    /** Told when the index is built rather than found. */
    onBuild?: () => void;
  } = {},
): Promise<Mafteach | null> {
  const built = await builtIndex(catalog, indexId, options);
  if (!built) return null;
  const letters = lettersOf(built);
  const strip = ({ key: _key, words: _words, ...t }: Built['topics'][number]): MafteachTopic => t;
  const limit = options.limit ?? 60;
  const offset = options.offset ?? 0;
  // A page holds up to `limit` topics, and stops sooner at `places` places (a topic like Shabbos has hundreds), never at none.
  const budget = options.places ?? 400;
  const page = (found: Built['topics']) => {
    const topics: MafteachTopic[] = [];
    let places = 0;
    for (const t of found.slice(offset, offset + limit)) {
      const count = t.volumes.reduce((n, v) => n + v.places.length, 0);
      if (topics.length && places + count > budget) break;
      topics.push(strip(t));
      places += count;
    }
    const end = offset + topics.length;
    return { index: built.index, letters, totals: built.totals, topics, found: found.length, offset, next: end < found.length ? end : null };
  };
  const q = unfinal(normalizeSearchText(options.q ?? ''));
  if (q) {
    const terms = q.split(' ');
    const has = (text: string) => terms.every((term) => text.includes(term));
    // The topic of that very name first, then those whose name begins with it, then those holding it, then those where only a place's context or sicha does.
    const rank = (t: Built['topics'][number]) => (t.key === q ? 0 : t.key.startsWith(q) ? 1 : 2);
    const named = built.topics.filter((t) => has(t.key)).sort((a, b) => rank(a) - rank(b));
    return page([...named, ...built.topics.filter((t) => !has(t.key) && has(t.words))]);
  }
  const letter = letterOf(letters, options.letter);
  return page(built.topics.filter((t) => t.letter === letter));
}

/** Each first letter and how many topics under it, in order. */
function lettersOf(built: Built): Mafteach['letters'] {
  const letters: Mafteach['letters'] = [];
  for (const t of built.topics) {
    const last = letters[letters.length - 1];
    if (last?.letter === t.letter) last.topics++;
    else letters.push({ letter: t.letter, topics: 1 });
  }
  return letters;
}

/** The letter asked for when the index has it, else its first. */
const letterOf = (letters: Mafteach['letters'], asked?: string) => (asked && letters.some((l) => l.letter === asked) ? asked : letters[0]?.letter);

/**
 * One letter's topics by name only, for a list to jump from (#195): each
 * topic's printed name, its offset in the letter (the `offset` that opens
 * the page beginning with it) and how many places it has. A letter of the
 * Likkutei Sichos index holds over two hundred topics, and reading their
 * places to list their names was some 3 kB a topic.
 */
export interface MafteachNames {
  index: Mafteach['index'];
  letters: Mafteach['letters'];
  letter: string | null;
  names: Array<{ topic: string; offset: number; places: number; machine: boolean }>;
}

export async function mafteachNames(
  catalog: Catalog,
  indexId: string,
  options: { letter?: string; seferId?: string | null; kept?: MafteachKept; stale?: boolean; onBuild?: () => void } = {},
): Promise<MafteachNames | null> {
  const built = await builtIndex(catalog, indexId, options);
  if (!built) return null;
  const letters = lettersOf(built);
  const letter = letterOf(letters, options.letter) ?? null;
  const names = built.topics
    .filter((t) => t.letter === letter)
    .map((t, offset) => ({ topic: t.topic, offset, places: t.volumes.reduce((n, v) => n + v.places.length, 0), machine: t.volumes.some((v) => v.machine) }));
  return { index: built.index, letters, letter, names };
}

/**
 * A subject index's topics in short, for search to name an index entry
 * without reading the whole index (#99): each topic's key (as `keyOf`
 * compares it), its printed name, how many places and volumes it has, and
 * whether a machine read any of it and no person checked it (as `machine` on a volume).
 * The scheduled run keeps it beside the built index.
 */
export interface MafteachSubjects {
  index: Mafteach['index'];
  topics: Record<string, [topic: string, places: number, volumes: number, machine: boolean]>;
}

export async function mafteachSubjects(
  catalog: Catalog,
  indexId: string,
  options: { seferId?: string | null; kept?: MafteachKept; stale?: boolean; onBuild?: () => void } = {},
): Promise<MafteachSubjects | null> {
  const built = await builtIndex(catalog, indexId, options);
  if (!built) return null;
  const topics: MafteachSubjects['topics'] = {};
  for (const t of built.topics) topics[t.key] = [t.topic, t.volumes.reduce((n, v) => n + v.places.length, 0), t.volumes.length, t.volumes.some((v) => v.machine)];
  return { index: built.index, topics };
}

/**
 * The topics of a subject index a search names: the topic of that very name,
 * then those that begin with it as a whole word (בטחון, then בטחון בה׳), up to `limit`.
 */
export function subjectsNamed(subjects: MafteachSubjects, query: string, limit = 3): Array<{ topic: string; places: number; volumes: number; machine: boolean }> {
  const q = keyOf(query);
  if (!q) return [];
  const exact = subjects.topics[q];
  const out = exact ? [{ topic: exact[0], places: exact[1], volumes: exact[2], machine: exact[3] }] : [];
  for (const [key, [topic, places, volumes, machine]] of Object.entries(subjects.topics)) {
    if (out.length >= limit) break;
    if (key.startsWith(`${q} `)) out.push({ topic, places, volumes, machine });
  }
  return out;
}
