import { isEntityId, type EntityId, type EntityType } from '@chassidushub/model';
import type { Catalog } from './catalog.js';
import { notFound } from './errors.js';
import { MOVE_FIELDS } from './organize.js';

/**
 * A catalog batch's tree before and after (the back room's review queue,
 * Flow): for each shelf, sefer or farbrengen a Suggestion changes what is
 * in, its children as main holds them now and as they will be once it is
 * approved, each marked: moved out, moved in, new, gone, renamed or put in
 * another place. A keeper reads where things go, in their neighbours'
 * company, instead of a list of changed fields.
 *
 * Long runs of what stays as it is fold into "… 40 more", and so do long
 * runs of the same mark (two thousand sichos moved into one sefer read as a
 * few of them and a count), so a phone gets a page it can read.
 */

/** What happens to a child in this parent. */
export type TreeMark = 'same' | 'out' | 'in' | 'new' | 'gone' | 'renamed' | 'moved';

export interface BatchTreeRow {
  id: EntityId;
  type: EntityType;
  /** Its name in Hebrew where it has one, as it is on this side. */
  name: string;
  path: string | null;
  mark: TreeMark;
  /** Renamed: what it was called before. */
  was?: string;
  /** A sefer listed as an addition to an official one, not one of the official sefarim. */
  addition?: boolean;
}

/** Rows folded away: how many, and their mark when they all share one. */
export interface BatchTreeGap {
  gap: number;
  mark?: TreeMark;
}

export type BatchTreeLine = BatchTreeRow | BatchTreeGap;

export interface BatchTreeGroup {
  parent: { id: EntityId; type: EntityType; name: string; path: string | null; isNew: boolean; gone: boolean };
  before: BatchTreeLine[];
  after: BatchTreeLine[];
  /** How many children it holds before and after (all of them, not only the lines shown). */
  counts: { before: number; after: number };
  /** How many of its children the batch changes. */
  changes: number;
}

export interface BatchTree {
  groups: BatchTreeGroup[];
  /** Parents left out past the first few (the ones with the most changes come first). */
  more: number;
  /** Items the batch changes in all, and how many of them change nothing in the tree (a date, a note). */
  items: number;
  elsewhere: number;
}

/** How many parents a page shows, and how many children are read of each. */
const MAX_GROUPS = 12;
const MAX_CHILDREN = 5000;
/** Neighbours kept beside each changed row, and how long a run of one mark may be before it folds. */
const CONTEXT = 1;
const RUN = 7;

type Data = Record<string, unknown>;
const isObject = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);

/** Items of these types are words, not places in the tree; a batch's fixes to them are not drawn here. */
const WORDS: ReadonlySet<string> = new Set(['text', 'segment', 'text-page', 'text-layer', 'alignment', 'alignment-span']);

/** Where an item hangs: each parent and the field it points through. A set's sets and items are one list. */
export interface Link {
  parent: EntityId;
  field: string;
}

export function linksOf(type: EntityType, data: Data | null): Link[] {
  if (!data || WORDS.has(type)) return [];
  const out: Link[] = [];
  if (type === 'set' && isEntityId(data.parent)) out.push({ parent: data.parent as EntityId, field: 'set' });
  if (Array.isArray(data.sets)) for (const s of data.sets) if (isEntityId(s)) out.push({ parent: s as EntityId, field: 'set' });
  for (const field of Object.values(MOVE_FIELDS[type] ?? {})) if (field && isEntityId(data[field])) out.push({ parent: data[field] as EntityId, field });
  return out;
}

const groupKey = (link: Link) => `${link.parent} ${link.field}`;

/** A name to read: Hebrew first, then English. */
export function readableName(data: Data | null | undefined): string | null {
  for (const field of ['name', 'title', 'label']) {
    const value = data?.[field];
    if (typeof value === 'string' && value) return value;
    if (isObject(value)) for (const lang of ['he', 'en']) if (typeof value[lang] === 'string' && value[lang]) return value[lang] as string;
  }
  return null;
}

const lastOfPath = (path: string | null) => (path ? decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) : null);

/** One child as one side holds it: enough to name it and put it in order. */
interface Child {
  id: EntityId;
  type: EntityType;
  path: string | null;
  name: string;
  /** Sort: a set's own sets, then official sefarim, then additions, then the rest; then its key; then path and id. */
  rank: number;
  key: string;
  tie: string;
  addition: boolean;
}

function childOf(id: EntityId, type: EntityType, path: string | null, data: Data, link: Link): Child {
  const addition = type === 'work' && isObject(data.addition);
  const own = link.field === 'set' && type !== 'set' ? (data.orderIn as Data | undefined)?.[link.parent] : undefined;
  const key = typeof own === 'string' ? own : typeof data.order === 'string' ? data.order : '~';
  const rank = link.field !== 'set' ? 0 : type === 'set' ? 0 : type === 'work' ? (addition ? 2 : 1) : 3;
  return { id, type, path, name: readableName(data) ?? lastOfPath(path) ?? id, rank, key, tie: `${path ?? ''}${id}`, addition };
}

const byPlace = (a: Child, b: Child) => a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0);

interface Changed {
  id: EntityId;
  type: EntityType;
  before: Data | null;
  after: Data | null;
  pathBefore: string | null;
  pathAfter: string | null;
}

/**
 * The tree a Suggestion makes, against main as it is now. Items it adds
 * to a project are drawn against main too: a catalog batch goes to main.
 */
export async function batchTree(catalog: Catalog, changesetId: number): Promise<BatchTree> {
  await catalog.changeset(changesetId).catch(() => {
    throw notFound(`suggestion ${changesetId}`);
  });
  const proposals = await catalog.proposals(changesetId);
  const ids = proposals.map((p) => p.entityId);
  // Main's version of each, in one read.
  const now = new Map<string, { data: Data; path: string | null }>();
  if (ids.length) {
    const { rows } = await catalog.db.query<{ entity_id: EntityId; path: string | null; data: Data | null }>(
      `SELECT r.entity_id, e.path, r.data - 'body' AS data FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = ANY($1::text[]) AND NOT e.deleted AND r.data IS NOT NULL`,
      [ids],
    );
    for (const row of rows) if (row.data) now.set(row.entity_id, { data: row.data, path: row.path });
  }
  const changed: Changed[] = proposals.map((p) => ({
    id: p.entityId,
    type: p.type,
    before: now.get(p.entityId)?.data ?? null,
    after: (p.rev.data as Data | null) ?? null,
    pathBefore: now.get(p.entityId)?.path ?? null,
    pathAfter: p.rev.path ?? now.get(p.entityId)?.path ?? null,
  }));

  // Each parent touched, with the changes that touch it.
  const groups = new Map<string, { link: Link; changes: Changed[] }>();
  let inTree = 0;
  for (const c of changed) {
    const was = linksOf(c.type, c.before);
    const will = linksOf(c.type, c.after);
    const touched = new Map<string, Link>();
    for (const link of [...was, ...will]) touched.set(groupKey(link), link);
    let counted = false;
    for (const [key, link] of touched) {
      const b = was.some((l) => groupKey(l) === key) ? childOf(c.id, c.type, c.pathBefore, c.before!, link) : null;
      const a = will.some((l) => groupKey(l) === key) ? childOf(c.id, c.type, c.pathAfter, c.after!, link) : null;
      // Only what moves, comes, goes, is renamed or put in another place; a changed date stays out of the tree.
      if (b && a && b.name === a.name && b.key === a.key && b.rank === a.rank) continue;
      const group = groups.get(key) ?? { link, changes: [] };
      group.changes.push(c);
      groups.set(key, group);
      counted = true;
    }
    if (counted) inTree++;
  }

  const ordered = [...groups.values()].sort((a, b) => b.changes.length - a.changes.length);
  const shown = ordered.slice(0, MAX_GROUPS);

  // The parents' names: main's, or the batch's own for a set it makes.
  const parentIds = shown.map((g) => g.link.parent);
  const parents = new Map<string, { type: EntityType; name: string; path: string | null; isNew: boolean; gone: boolean }>();
  if (parentIds.length) {
    const { rows } = await catalog.db.query<{ id: EntityId; type: EntityType; path: string | null; data: Data | null }>(
      `SELECT e.id, e.type, e.path, jsonb_build_object('name', r.data->'name', 'title', r.data->'title', 'label', r.data->'label') AS data
         FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = ANY($1::text[]) AND NOT e.deleted`,
      [parentIds],
    );
    for (const row of rows) parents.set(row.id, { type: row.type, name: readableName(row.data) ?? lastOfPath(row.path) ?? row.id, path: row.path, isNew: false, gone: false });
  }
  for (const c of changed) {
    const parent = parents.get(c.id);
    if (parent && c.after === null) parent.gone = true;
    if (!parent && parentIds.includes(c.id) && c.after) parents.set(c.id, { type: c.type, name: readableName(c.after) ?? lastOfPath(c.pathAfter) ?? c.id, path: c.pathAfter, isNew: true, gone: false });
  }

  const out: BatchTreeGroup[] = [];
  for (const { link, changes } of shown) {
    const parent = parents.get(link.parent) ?? { type: 'set' as EntityType, name: link.parent, path: null, isNew: false, gone: false };
    const mine = new Map(changes.map((c) => [c.id, c]));
    const types = [...new Set(changes.map((c) => c.type))];
    const before = await childrenOnMain(catalog, link, types);
    const there = new Set(before.map((child) => child.id));
    // A changed child past the children read still belongs on the before side.
    for (const c of changes)
      if (!there.has(c.id) && linksOf(c.type, c.before).some((l) => groupKey(l) === groupKey(link))) {
        before.push(childOf(c.id, c.type, c.pathBefore, c.before!, link));
        there.add(c.id);
      }
    before.sort(byPlace);
    const after: Child[] = [];
    for (const child of before) {
      const c = mine.get(child.id);
      if (!c) after.push(child);
      else if (linksOf(c.type, c.after).some((l) => groupKey(l) === groupKey(link))) after.push(childOf(c.id, c.type, c.pathAfter, c.after!, link));
    }
    for (const c of changes) if (!there.has(c.id) && linksOf(c.type, c.after).some((l) => groupKey(l) === groupKey(link))) after.push(childOf(c.id, c.type, c.pathAfter, c.after!, link));
    after.sort(byPlace);

    const beforeOf = new Map(before.map((child) => [child.id, child]));
    const afterOf = new Map(after.map((child) => [child.id, child]));
    const moved = movedIn(before, after, mine);
    const beforeRows: BatchTreeRow[] = before.map((child) => {
      const c = mine.get(child.id);
      let mark: TreeMark = 'same';
      if (c) mark = c.after === null ? 'gone' : !afterOf.has(child.id) ? 'out' : afterOf.get(child.id)!.name !== child.name ? 'renamed' : moved.has(child.id) ? 'moved' : 'same';
      return rowOf(child, mark);
    });
    const afterRows: BatchTreeRow[] = after.map((child) => {
      const c = mine.get(child.id);
      if (!c) return rowOf(child, 'same');
      const was = beforeOf.get(child.id);
      if (c.before === null) return rowOf(child, 'new');
      if (!was) return rowOf(child, 'in');
      if (was.name !== child.name) return { ...rowOf(child, 'renamed'), was: was.name };
      return rowOf(child, moved.has(child.id) ? 'moved' : 'same');
    });
    out.push({
      parent: { id: link.parent, ...parent },
      before: fold(beforeRows),
      after: fold(afterRows),
      counts: { before: before.length, after: after.length },
      changes: changes.length,
    });
  }
  return { groups: out, more: Math.max(0, ordered.length - shown.length), items: changed.length, elsewhere: changed.length - inTree };
}

function rowOf(child: Child, mark: TreeMark): BatchTreeRow {
  return { id: child.id, type: child.type, name: child.name, path: child.path, mark, ...(child.addition ? { addition: true } : {}) };
}

/**
 * Children that changed place among those on both sides: a child whose own
 * key changed and whose neighbours among the others are not the ones it had.
 */
function movedIn(before: Child[], after: Child[], mine: Map<string, Changed>): Set<string> {
  const was0 = new Set(before.map((c) => c.id));
  const both = new Set(after.map((c) => c.id).filter((id) => was0.has(id)));
  const seq = (list: Child[]) => list.filter((c) => both.has(c.id)).map((c) => c.id);
  const was = seq(before);
  const will = seq(after);
  const neighbours = (list: string[]) => new Map(list.map((id, i) => [id, `${list[i - 1] ?? ''} ${list[i + 1] ?? ''}`]));
  const n1 = neighbours(was);
  const n2 = neighbours(will);
  const keyOf = new Map(before.map((c) => [c.id, `${c.rank} ${c.key}`]));
  const out = new Set<string>();
  for (const child of after) if (mine.has(child.id) && both.has(child.id) && keyOf.get(child.id) !== `${child.rank} ${child.key}` && n1.get(child.id) !== n2.get(child.id)) out.add(child.id);
  return out;
}

/**
 * Keeps each changed row with a neighbour on each side, and the first and
 * last; the rest folds into counts. A long run of one mark keeps its first
 * three and last two.
 */
export function fold(rows: BatchTreeRow[]): BatchTreeLine[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  if (rows.length) keep[0] = keep[rows.length - 1] = true;
  rows.forEach((row, i) => {
    if (row.mark === 'same') return;
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) keep[j] = true;
  });
  // Runs of one mark, folded in the middle.
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1]!.mark === rows[i]!.mark) j++;
    if (rows[i]!.mark !== 'same' && j - i + 1 > RUN) for (let k = i + 3; k <= j - 2; k++) keep[k] = false;
    i = j + 1;
  }
  const out: BatchTreeLine[] = [];
  for (let i = 0; i < rows.length; ) {
    if (keep[i]) {
      out.push(rows[i]!);
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && !keep[j]) j++;
    const marks = new Set(rows.slice(i, j).map((r) => r.mark));
    const only = marks.size === 1 ? [...marks][0]! : undefined;
    out.push(only && only !== 'same' ? { gap: j - i, mark: only } : { gap: j - i });
    i = j;
  }
  return out;
}

const LIVE = 'NOT e.deleted AND e.main_rev IS NOT NULL';
const COLUMNS = `e.id, e.type, e.path, jsonb_build_object('name', r.data->'name', 'title', r.data->'title', 'label', r.data->'label', 'order', r.data->'order', 'addition', r.data->'addition', 'orderIn', jsonb_build_object($1::text, r.data->'orderIn'->$1)) AS data`;

/** A parent's children on main, each with only its name and place: a set's sets and items, a sefer's sichos, a farbrengen's recordings. */
async function childrenOnMain(catalog: Catalog, link: Link, types: EntityType[]): Promise<Child[]> {
  type Row = { id: EntityId; type: EntityType; path: string | null; data: Data };
  const read = async (sql: string, params: unknown[]) => (await catalog.db.query<Row>(sql, params)).rows.map((r) => childOf(r.id, r.type, r.path, r.data, link));
  if (link.field === 'set') {
    const sets = await read(`SELECT ${COLUMNS} FROM entity_ref x JOIN entity e ON e.id = x.from_id AND ${LIVE} JOIN revision r ON r.id = e.main_rev WHERE x.to_id = $1 AND x.field = 'parent' AND e.type = 'set' LIMIT ${MAX_CHILDREN}`, [link.parent]);
    const items = await read(`SELECT ${COLUMNS} FROM entity_ref x JOIN entity e ON e.id = x.from_id AND ${LIVE} JOIN revision r ON r.id = e.main_rev WHERE x.to_id = $1 AND x.field = 'sets' LIMIT ${MAX_CHILDREN}`, [link.parent]);
    return [...sets, ...items];
  }
  return read(`SELECT ${COLUMNS} FROM entity_ref x JOIN entity e ON e.id = x.from_id AND ${LIVE} JOIN revision r ON r.id = e.main_rev WHERE x.to_id = $1 AND x.field = $2 AND e.type = ANY($3::text[]) LIMIT ${MAX_CHILDREN}`, [link.parent, link.field, types]);
}
