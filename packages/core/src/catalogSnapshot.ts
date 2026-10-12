import type { Db } from '@chassidushub/db';
import type { EntityId } from '@chassidushub/model';

/**
 * The catalog tree as a few files that never change once written, so a page
 * can draw the library, a sefer, a volume or a year of farbrengens from
 * memory, with no request to the API and no read of the database
 * (docs/catalog-snapshot.md; the plan is studio/plans/www-instant.md, item A).
 *
 * This is what makes the reader app instant: it loads one versioned catalog
 * once and every move after that is a lookup. Here the same tree is cut in
 * parts, so a reader fetches only what the page needs:
 *
 *   manifest.json            small, changes with the catalog: which files make up the snapshot now
 *   tree.<hash>.json         every shelf (Set) and sefer, with each sefer's volumes and how many units each holds
 *   work-<id>.<hash>.json    one sefer's units, by volume
 *   year-<yyyy>.<hash>.json  one Hebrew year's farbrengens and other events, with how many recordings each has
 *
 * A file is named by its content's sha256, so a file that did not change in a
 * new snapshot keeps its address, and browsers, the edge and a service worker
 * keep it for good. Only the manifest moves.
 *
 * Built from main, never from anyone's words: units come from unit_place
 * (migration 0030), and of other items only the few fields shown are read,
 * each item's revision unpacked once.
 */

/** Bumped when a file's shape changes in a way an old reader would misread. */
export const SNAPSHOT_FORMAT = 1;

/** The kinds of item the snapshot shows: a change to any of them makes a new one. */
export const SNAPSHOT_TYPES = ['set', 'work', 'unit', 'event', 'recording'] as const;

/**
 * The Rebbeim, in order: the fixed top of the catalog tree (the same list as
 * apps/www/app/lib/catalog.ts). Their shelves come first in `top`.
 */
export const SNAPSHOT_REBBEIM = [
  '/sets/baal-shem-tov',
  '/sets/maggid',
  '/sets/alter-rebbe',
  '/sets/mitteler-rebbe',
  '/sets/tzemach-tzedek',
  '/sets/rebbe-maharash',
  '/sets/rebbe-rashab',
  '/sets/frierdiker-rebbe',
  '/sets/the-rebbe',
];

/** A name in Hebrew, and in English where it has one. */
export interface SnapshotName {
  he: string;
  en?: string;
}

/** One file of a snapshot, as the manifest lists it. */
export interface SnapshotFile {
  /** Its name, under the manifest's `base`: `tree.<16 hex>.json`. Never reused for other bytes. */
  file: string;
  bytes: number;
  sha256: string;
}

export interface SnapshotManifest {
  format: typeof SNAPSHOT_FORMAT;
  /** The snapshot's version: the last commit that changed a shelf, sefer, unit, event or recording, as a string. */
  version: string;
  /** The same commit, as a number: a newer snapshot has a larger one. */
  seq: number;
  /** When that commit was merged (ISO), and when this snapshot was built. */
  changedAt: string;
  builtAt: string;
  /** Where the files are: a file's address is `base` + its `file`. The API serves the manifest with an absolute base. */
  base: string;
  tree: SnapshotFile;
  /** Each sefer with units, by id. */
  works: Record<EntityId, SnapshotFile & { units: number }>;
  /** Each Hebrew year with events, by year (`"5742"`). */
  years: Record<string, SnapshotFile & { events: number }>;
  counts: { sets: number; works: number; units: number; events: number };
}

/** A shelf (Set). Its lists are in the catalog's order. */
export interface SnapshotSet {
  id: EntityId;
  path: string | null;
  name: SnapshotName;
  slug?: string;
  parent?: EntityId;
  /** 1 to 9 for the Rebbeim's shelves, in their line (SNAPSHOT_REBBEIM). */
  rebbe?: number;
  /** The shelves inside it. */
  sets: EntityId[];
  /** The official sefarim on it. */
  works: EntityId[];
  /** The additions on it that belong to no sefer on it (an addition to a sefer here is on that sefer's page). */
  additions: EntityId[];
}

/** One volume (top-level part) of a sefer. */
export interface SnapshotPart {
  value: string;
  label: SnapshotName | null;
  units: number;
}

/** A sefer (Work). */
export interface SnapshotWork {
  id: EntityId;
  path: string | null;
  title: SnapshotName;
  slug?: string;
  /** The shelves it sits on. */
  sets: EntityId[];
  /** Set when it is an addition to an official sefer, not one of the sefarim the tree is built of. */
  addition?: { kind: string; to?: EntityId };
  /** The additions to it, in order. */
  additions: EntityId[];
  /** Its volumes in order, from its units' places; empty for a sefer with no units (a scan only). */
  parts: SnapshotPart[];
  units: number;
}

export interface SnapshotTree {
  format: typeof SNAPSHOT_FORMAT;
  /** The top shelves: the Rebbeim in their line, then the others in the catalog's order. */
  top: EntityId[];
  sets: Record<EntityId, SnapshotSet>;
  works: Record<EntityId, SnapshotWork>;
}

/** One unit (a sicha, letter, chapter) in its volume. */
export interface SnapshotUnit {
  id: EntityId;
  path: string | null;
  title: SnapshotName;
  /** Its place in the volume, the last of its position's labels ("עמ׳ 49"), when it has more than one level. */
  place?: string;
  /** The heading inside the volume it falls under (a reshimah's part), when its position has more than two levels. */
  group?: string;
}

export interface SnapshotWorkFile {
  format: typeof SNAPSHOT_FORMAT;
  work: EntityId;
  parts: Array<SnapshotPart & { items: SnapshotUnit[] }>;
}

export interface SnapshotEvent {
  id: EntityId;
  path: string | null;
  kind: string;
  /** Its Hebrew date key (`5742-05-10`, or `5742-05` / `5742` when not known to the day). */
  date: string;
  title: SnapshotName | null;
  /** Its order among the events of that day. */
  order?: number;
  recordings: number;
  /** The kinds of its linked documents, hanachos first (`mugah`, `bilti-mugah`, ...). */
  links: string[];
}

export interface SnapshotYearFile {
  format: typeof SNAPSHOT_FORMAT;
  year: number;
  events: SnapshotEvent[];
}

/** Where a snapshot's files are kept: R2 on Workers, memory in tests and local work. */
export interface SnapshotStore {
  get(key: string): Promise<string | null>;
  /** `immutable` for a file named by its content, `manifest` for the manifest. */
  put(key: string, text: string, kind: 'immutable' | 'manifest'): Promise<void>;
}

export const SNAPSHOT_MANIFEST_KEY = 'catalog/manifest.json';
export const snapshotFileKey = (file: string) => `catalog/files/${file}`;
/** A file name as the manifest gives it: a few lowercase words, then 16 hex of its sha256. */
export const SNAPSHOT_FILE_NAME = /^[a-z0-9][a-z0-9-]{0,80}\.[0-9a-f]{16}\.json$/;

/** A store in memory. */
export function memorySnapshotStore(): SnapshotStore & { keys(): string[] } {
  const kept = new Map<string, string>();
  return {
    get: async (key) => kept.get(key) ?? null,
    put: async (key, text) => void kept.set(key, text),
    keys: () => [...kept.keys()].sort(),
  };
}

// ------------------------------------------------------------------ reading main

/**
 * `now()` in a statement keeps Hyperdrive from answering it from its query
 * cache: a snapshot read just after an Approve must see that Approve.
 */
const FRESH = 'now() IS NOT NULL';

/** The last commit that changed anything the snapshot shows, and when it was merged; 0 for an empty catalog. */
export async function snapshotSeq(db: Db): Promise<{ seq: number; at: string }> {
  // Along entity_updated (migration 0010) from the newest change back to the first of these types: a step or two.
  const { rows } = await db.query<{ seq: string | number | null; at: string | Date | null }>(
    `SELECT e.seq, c.at FROM (SELECT updated_seq AS seq FROM entity WHERE updated_seq IS NOT NULL AND type = ANY($1) ORDER BY updated_seq DESC LIMIT 1) e
     LEFT JOIN commit c ON c.seq = e.seq WHERE ${FRESH}`,
    [[...SNAPSHOT_TYPES]],
  );
  const row = rows[0];
  return { seq: Number(row?.seq ?? 0), at: row?.at ? new Date(row.at).toISOString() : new Date(0).toISOString() };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A name as stored (a string, or one per language) as the snapshot gives it; markup some imports left in names is dropped. */
function nameOf(value: unknown, fallback = ''): SnapshotName {
  const plain = (v: unknown) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim() : '');
  if (value && typeof value === 'object') {
    const names = value as Record<string, unknown>;
    const he = plain(names.he) || plain(names.en) || plain(Object.values(names).find((v) => typeof v === 'string'));
    const en = plain(names.en);
    return en && en !== he ? { he: he || fallback, en } : { he: he || fallback };
  }
  return { he: plain(value) || fallback };
}

const nameOrNull = (value: unknown): SnapshotName | null => {
  const name = nameOf(value);
  return name.he ? name : null;
};

interface Picked<T> {
  id: EntityId;
  path: string | null;
  data: T;
}

/** Items of one type on main, with only `fields` of each, its revision unpacked once (not once per field). */
async function picked<T>(db: Db, type: string, fields: string[], where = 'TRUE'): Promise<Array<Picked<T>>> {
  const pairs = fields.map((f) => `'${f}', d.x->'${f}'`).join(', ');
  const { rows } = await db.query<{ id: EntityId; path: string | null; data: T }>(
    `SELECT e.id, e.path, jsonb_strip_nulls(jsonb_build_object(${pairs})) AS data
     FROM entity e JOIN revision r ON r.id = e.main_rev
     CROSS JOIN LATERAL (SELECT y.x FROM (SELECT r.data || '{}'::jsonb AS x OFFSET 0) y OFFSET 0) d
     WHERE e.type = $1 AND e.main_rev IS NOT NULL AND NOT e.deleted AND r.data IS NOT NULL AND (${where}) AND ${FRESH}
     ORDER BY e.id`,
    [type],
  );
  return rows;
}

interface SetFields {
  name?: unknown;
  slug?: string;
  parent?: EntityId;
  order?: string;
}

interface WorkFields {
  title?: unknown;
  slug?: string;
  sets?: EntityId[];
  order?: string;
  orderIn?: Record<string, string>;
  addition?: { kind?: string; to?: EntityId };
}

interface EventFields {
  kind?: string;
  title?: unknown;
  date?: string;
  order?: number;
  links?: Array<{ kind?: string }>;
}

interface PlaceRow {
  unit_id: EntityId;
  work_id: EntityId;
  part: string | null;
  position: Array<{ value?: string; label?: unknown }> | null;
  label: unknown;
  path: string | null;
}

/** How many units a read of unit_place takes at most: a few MB, well inside a Worker's memory. */
const UNITS_PER_READ = 5000;

/** The tree, and each sefer's units and each year's events, as built. */
export interface SnapshotParts {
  seq: number;
  changedAt: string;
  tree: SnapshotTree;
  works: Map<EntityId, SnapshotWorkFile>;
  years: Map<number, SnapshotYearFile>;
}

/** A unit's place in its volume, from the last of its position's labels. */
function placeOf(position: PlaceRow['position']): string | undefined {
  const levels = Array.isArray(position) ? position : [];
  const last = levels.length > 1 ? nameOf(levels[levels.length - 1]?.label).he : '';
  return last ? last.replace(/'/g, '׳') : undefined;
}

/** The heading inside a volume, from the level of its position between the volume and the unit. */
function groupOf(position: PlaceRow['position']): string | undefined {
  const levels = Array.isArray(position) ? position : [];
  return levels.length > 2 ? nameOf(levels[1]?.label).he || undefined : undefined;
}

/** Every sefer's units, by volume, from unit_place: a few reads of whole sefarim at a time, in each sefer's order. */
async function unitsByWork(db: Db): Promise<Map<EntityId, SnapshotWorkFile>> {
  const { rows: counts } = await db.query<{ work_id: EntityId; n: number }>(`SELECT work_id, count(*)::int AS n FROM unit_place WHERE ${FRESH} GROUP BY work_id ORDER BY work_id`);
  const batches: EntityId[][] = [];
  let batch: EntityId[] = [];
  let size = 0;
  for (const { work_id, n } of counts) {
    if (batch.length && size + n > UNITS_PER_READ) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(work_id);
    size += n;
  }
  if (batch.length) batches.push(batch);

  const out = new Map<EntityId, SnapshotWorkFile>();
  for (const ids of batches) {
    const { rows } = await db.query<PlaceRow>(
      `SELECT unit_id, work_id, part, position, label, path FROM unit_place WHERE work_id = ANY($1) AND ${FRESH} ORDER BY work_id, ord, unit_id`,
      [ids],
    );
    for (const row of rows) {
      let file = out.get(row.work_id);
      if (!file) {
        file = { format: SNAPSHOT_FORMAT, work: row.work_id, parts: [] };
        out.set(row.work_id, file);
      }
      const value = row.part ?? '';
      // A volume is where its first unit is, in the sefer's order (as workOutline counts them).
      let part = file.parts.find((p) => p.value === value);
      if (!part) {
        part = { value, label: nameOrNull(row.position?.[0]?.label), units: 0, items: [] };
        file.parts.push(part);
      }
      const unit: SnapshotUnit = { id: row.unit_id, path: row.path, title: nameOf(row.label, row.path ?? row.unit_id) };
      const place = placeOf(row.position);
      const group = groupOf(row.position);
      if (place) unit.place = place;
      if (group) unit.group = group;
      part.items.push(unit);
      part.units++;
    }
  }
  return out;
}

/** Each Hebrew year's events (letters aside: they are reached through their sefer), in the order of the year. */
async function eventsByYear(db: Db): Promise<Map<number, SnapshotYearFile>> {
  const events = await picked<EventFields>(db, 'event', ['kind', 'title', 'date', 'order', 'links'], `r.data->>'kind' IS DISTINCT FROM 'letter' AND r.data->>'date' ~ '^\\d{4}'`);
  const { rows: counted } = await db.query<{ id: EntityId; n: number }>(
    `SELECT x.to_id AS id, count(*)::int AS n FROM entity_ref x JOIN entity f ON f.id = x.from_id AND f.type = 'recording' AND NOT f.deleted AND f.main_rev IS NOT NULL
     WHERE x.field = 'event' AND ${FRESH} GROUP BY x.to_id`,
  );
  const recordings = new Map(counted.map((r) => [r.id, r.n]));
  const out = new Map<number, SnapshotYearFile>();
  for (const { id, path, data } of events) {
    const date = data.date!;
    const year = Number(date.slice(0, 4));
    let file = out.get(year);
    if (!file) {
      file = { format: SNAPSHOT_FORMAT, year, events: [] };
      out.set(year, file);
    }
    const event: SnapshotEvent = {
      id,
      path,
      kind: data.kind ?? 'other',
      date,
      title: nameOrNull(data.title),
      recordings: recordings.get(id) ?? 0,
      links: (Array.isArray(data.links) ? data.links : []).map((l) => l?.kind).filter((k): k is string => typeof k === 'string'),
    };
    if (typeof data.order === 'number') event.order = data.order;
    file.events.push(event);
  }
  for (const file of out.values()) file.events.sort((a, b) => cmp(a.date, b.date) || (a.order ?? 0) - (b.order ?? 0) || cmp(a.id, b.id));
  return out;
}

/** The shelves and sefarim, each list in the catalog's order: by its key in that shelf, else `order`, then path. */
function treeOf(sets: Array<Picked<SetFields>>, works: Array<Picked<WorkFields>>, units: Map<EntityId, SnapshotWorkFile>): SnapshotTree {
  const tree: SnapshotTree = { format: SNAPSHOT_FORMAT, top: [], sets: {}, works: {} };
  const setOrder = new Map(sets.map((s) => [s.id, s.data.order ?? '']));
  const pathOf = new Map([...sets, ...works].map((x) => [x.id, x.path ?? '']));
  const bySetOrder = (a: EntityId, b: EntityId) => cmp(setOrder.get(a) ?? '', setOrder.get(b) ?? '') || cmp(pathOf.get(a) ?? '', pathOf.get(b) ?? '') || cmp(a, b);

  for (const { id, path, data } of sets) {
    const set: SnapshotSet = { id, path, name: nameOf(data.name, data.slug ?? id), sets: [], works: [], additions: [] };
    if (data.slug) set.slug = data.slug;
    if (typeof data.parent === 'string') set.parent = data.parent;
    const rebbe = path ? SNAPSHOT_REBBEIM.indexOf(path) : -1;
    if (rebbe >= 0 && !set.parent) set.rebbe = rebbe + 1;
    tree.sets[id] = set;
  }
  for (const set of Object.values(tree.sets)) {
    const parent = set.parent ? tree.sets[set.parent] : undefined;
    if (parent) parent.sets.push(set.id);
    else tree.top.push(set.id);
  }
  for (const set of Object.values(tree.sets)) set.sets.sort(bySetOrder);
  tree.top.sort((a, b) => (tree.sets[a]!.rebbe ?? 99) - (tree.sets[b]!.rebbe ?? 99) || bySetOrder(a, b));

  const workData = new Map(works.map((w) => [w.id, w.data]));
  for (const { id, path, data } of works) {
    const file = units.get(id);
    const work: SnapshotWork = {
      id,
      path,
      title: nameOf(data.title, data.slug ?? id),
      sets: (Array.isArray(data.sets) ? data.sets : []).filter((s) => typeof s === 'string' && tree.sets[s]),
      additions: [],
      parts: (file?.parts ?? []).map(({ value, label, units: n }) => ({ value, label, units: n })),
      units: file ? file.parts.reduce((n, p) => n + p.units, 0) : 0,
    };
    if (data.slug) work.slug = data.slug;
    if (data.addition && typeof data.addition === 'object') {
      const to = typeof data.addition.to === 'string' && workData.has(data.addition.to) ? data.addition.to : undefined;
      work.addition = { kind: data.addition.kind ?? 'other', ...(to ? { to } : {}) };
    }
    tree.works[id] = work;
  }
  const keyIn = (work: EntityId, set: EntityId | null) => {
    const data = workData.get(work);
    return (set ? data?.orderIn?.[set] : undefined) ?? data?.order ?? '';
  };
  const byKeyIn = (set: EntityId | null) => (a: EntityId, b: EntityId) => cmp(keyIn(a, set), keyIn(b, set)) || cmp(pathOf.get(a) ?? '', pathOf.get(b) ?? '') || cmp(a, b);
  for (const work of Object.values(tree.works)) {
    const to = work.addition?.to;
    if (to) tree.works[to]!.additions.push(work.id);
    for (const setId of work.sets) {
      const set = tree.sets[setId]!;
      if (!work.addition) set.works.push(work.id);
      // An addition to a sefer on this same shelf is shown on that sefer's page, not on the shelf.
      else if (!(to && tree.works[to]!.sets.includes(setId) && !tree.works[to]!.addition)) set.additions.push(work.id);
    }
  }
  for (const set of Object.values(tree.sets)) {
    set.works.sort(byKeyIn(set.id));
    set.additions.sort(byKeyIn(set.id));
  }
  for (const work of Object.values(tree.works)) work.additions.sort(byKeyIn(null));
  return tree;
}

/** Everything a snapshot is made of, read from main. */
export async function readSnapshot(db: Db): Promise<SnapshotParts> {
  const { seq, at } = await snapshotSeq(db);
  const sets = await picked<SetFields>(db, 'set', ['name', 'slug', 'parent', 'order']);
  const works = await picked<WorkFields>(db, 'work', ['title', 'slug', 'sets', 'order', 'orderIn', 'addition']);
  const units = await unitsByWork(db);
  const years = await eventsByYear(db);
  // A unit of a sefer that is not on main (deleted, or never merged) has no page to list it on.
  const live = new Set(works.map((w) => w.id));
  for (const id of [...units.keys()]) if (!live.has(id)) units.delete(id);
  return { seq, changedAt: at, tree: treeOf(sets, works, units), works: units, years };
}

// ------------------------------------------------------------------ writing it

async function sha256Hex(text: string): Promise<{ hex: string; bytes: number }> {
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { hex: [...digest].map((b) => b.toString(16).padStart(2, '0')).join(''), bytes: bytes.byteLength };
}

/** A file's name: a stem safe in a URL, and the start of its sha256. */
const safeStem = (stem: string) => stem.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';


export async function readManifest(store: SnapshotStore): Promise<SnapshotManifest | null> {
  const text = await store.get(SNAPSHOT_MANIFEST_KEY);
  if (!text) return null;
  try {
    const manifest = JSON.parse(text) as SnapshotManifest;
    return manifest.format === SNAPSHOT_FORMAT ? manifest : null;
  } catch {
    return null;
  }
}

/**
 * Writes a snapshot of main to `store`: each file not already written under
 * its name, then the manifest that lists them. A file is never written over
 * and never removed, so a reader holding an older manifest still finds its
 * files. Returns the manifest written, or the one kept when it was as new.
 */
export async function writeSnapshot(db: Db, store: SnapshotStore, options: { base?: string; now?: Date } = {}): Promise<{ manifest: SnapshotManifest; written: number }> {
  const previous = await readManifest(store);
  const parts = await readSnapshot(db);
  const had = new Set<string>();
  if (previous) {
    had.add(previous.tree.file);
    for (const f of Object.values(previous.works)) had.add(f.file);
    for (const f of Object.values(previous.years)) had.add(f.file);
  }
  let written = 0;
  const put = async (stem: string, value: unknown): Promise<SnapshotFile> => {
    // No version inside a file: a sefer or a year that did not change keeps its bytes, its name and its address.
    const text = JSON.stringify(value);
    const { hex, bytes } = await sha256Hex(text);
    const file = `${safeStem(stem)}.${hex.slice(0, 16)}.json`;
    if (!had.has(file)) {
      await store.put(snapshotFileKey(file), text, 'immutable');
      written++;
    }
    return { file, bytes, sha256: hex };
  };

  const works: SnapshotManifest['works'] = {};
  for (const [id, file] of parts.works) works[id] = { ...(await put(`work-${id}`, file)), units: file.parts.reduce((n, p) => n + p.units, 0) };
  const years: SnapshotManifest['years'] = {};
  for (const year of [...parts.years.keys()].sort((a, b) => a - b)) {
    const file = parts.years.get(year)!;
    years[String(year)] = { ...(await put(`year-${year}`, file)), events: file.events.length };
  }
  const tree = await put('tree', parts.tree);
  const manifest: SnapshotManifest = {
    format: SNAPSHOT_FORMAT,
    version: String(parts.seq),
    seq: parts.seq,
    changedAt: parts.changedAt,
    builtAt: (options.now ?? new Date()).toISOString(),
    base: options.base ?? '',
    tree,
    works,
    years,
    counts: {
      sets: Object.keys(parts.tree.sets).length,
      works: Object.keys(parts.tree.works).length,
      units: Object.values(works).reduce((n, w) => n + w.units, 0),
      events: Object.values(years).reduce((n, y) => n + y.events, 0),
    },
  };
  // Another build that finished first with a newer catalog wins: a manifest never goes back.
  const latest = await readManifest(store);
  if (latest && latest.seq > manifest.seq) return { manifest: latest, written };
  await store.put(SNAPSHOT_MANIFEST_KEY, JSON.stringify(manifest), 'manifest');
  return { manifest, written };
}

/**
 * Builds a new snapshot when main has changed since the one kept (one cheap
 * statement when it has not). Returns the manifest kept now, and whether it
 * was built this time.
 */
export async function refreshSnapshot(db: Db, store: SnapshotStore, options: { base?: string; now?: Date } = {}): Promise<{ manifest: SnapshotManifest; built: boolean }> {
  const kept = await readManifest(store);
  if (kept) {
    const { seq } = await snapshotSeq(db);
    if (seq <= kept.seq) return { manifest: kept, built: false };
  }
  const { manifest } = await writeSnapshot(db, store, options);
  return { manifest, built: true };
}
