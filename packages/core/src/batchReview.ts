import { normalizeSearchText } from '@chassidushub/hebrew';
import { mayExport, type EntityId, type EntityType, type RightsState } from '@chassidushub/model';
import { linksOf, readableName, type Link } from './batchTree.js';
import type { Catalog } from './catalog.js';
import { notFound } from './errors.js';
import { MOVE_FIELDS } from './organize.js';

/**
 * A catalog batch as a keeper checks it on a phone (the back room's review
 * queue, Flow): what the Suggestion does to each of its items, counted by
 * kind of change (moved, merged, renamed, relabelled, put in another place,
 * new, deleted, words), where things go (from shelf to shelf, with how
 * many), a few samples of each kind chosen to show the range, and the whole
 * list a page at a time, searchable, each item before and after in a line.
 *
 * The tree (batchTree.ts) shows where things land among their neighbours;
 * this says how many of each there are and lets every one be read.
 */

/** What a batch does to an item. One item may have several (moved and renamed). */
export type ChangeKind = 'new' | 'moved' | 'merged' | 'renamed' | 'relabelled' | 'reordered' | 'words' | 'deleted';

/** In the order the summary says them. */
export const CHANGE_KINDS: readonly ChangeKind[] = ['moved', 'merged', 'renamed', 'relabelled', 'reordered', 'new', 'words', 'deleted'];

/** A shelf, sefer or farbrengen an item is in, or the item it is merged into. */
export interface BatchPlace {
  id: EntityId;
  name: string;
  path: string | null;
}

/** A fact that changes (a date, a recipient, a number), each side as a short line; null where it is not there. */
export interface BatchFact {
  field: string;
  before: string | null;
  after: string | null;
}

export interface BatchItem {
  id: EntityId;
  type: EntityType;
  kinds: ChangeKind[];
  /** Its name once approved (what it was called, for one deleted or merged). */
  name: string;
  /** Renamed: its name now. */
  was?: string;
  path: string | null;
  /** Where it is now and where it will be: moved (both), new (to), deleted (from). */
  from?: BatchPlace | null;
  to?: BatchPlace | null;
  /** Merged: the item it is merged into. */
  into?: BatchPlace | null;
  /** Relabelled: the facts that change, the first few. */
  facts?: BatchFact[];
  /**
   * Words added or changed: how many paragraphs, the first words (left out
   * where the source's terms do not allow copies), and whether a machine
   * read them and no person has checked them yet.
   */
  words?: {
    paragraphs: number;
    first: string | null;
    added: boolean;
    machine: boolean;
  };
}

export interface BatchFlow {
  /** Moved from one place to another, new in a place, or merged into another item. */
  way: 'moved' | 'new' | 'merged';
  from: BatchPlace | null;
  to: BatchPlace | null;
  count: number;
}

export interface BatchReview {
  /** Items the batch changes in all. */
  items: number;
  /** How many items have each kind of change; an item with two kinds counts in both. */
  counts: Partial<Record<ChangeKind, number>>;
  /** Of the items whose words change, how many a machine read and no person has checked. */
  machine: number;
  /** Where things go: moved, new and merged items by where they come from and where they go, the biggest first. */
  flows: BatchFlow[];
  /** Flows past the first ones. */
  flowsMore: number;
  /** A few items of each kind: the first and last, and the odd ones (the shortest and longest name, the rarest way). */
  samples: Array<{ kind: ChangeKind; items: BatchItem[] }>;
  /** The whole list, one page of it, by kind and words asked. */
  list: {
    kind: ChangeKind | null;
    q: string;
    offset: number;
    limit: number;
    total: number;
    rows: BatchItem[];
  };
}

export interface BatchReviewQuery {
  kind?: ChangeKind | null;
  q?: string;
  offset?: number;
  limit?: number;
}

type Data = Record<string, unknown>;

const MAX_FLOWS = 12;
const MAX_FACTS = 4;
const SAMPLES = 5;
const FIRST_WORDS = 160;

/** The fields that say where an item hangs and in what order: moving and reordering, not relabelling. */
const PLACE_FIELDS: ReadonlySet<string> = new Set(['parent', 'sets', 'order', 'orderIn', 'slug', ...Object.values(MOVE_FIELDS).flatMap((fields) => Object.values(fields ?? {}) as string[])]);
/** Words, and where they came from, are said as words. */
const WORD_FIELDS: ReadonlySet<string> = new Set(['body', 'bodySource']);
const NAME_FIELDS: ReadonlySet<string> = new Set(['name', 'title', 'label']);
/**
 * Items that are words themselves (a paragraph, a scanned page's lines, a
 * transcript's spans): whatever changes in them is said as words changed,
 * never shown, since their source's terms may withhold them (gate.ts).
 */
const WORD_TYPES: ReadonlySet<string> = new Set(['text', 'segment', 'text-page', 'text-layer', 'alignment', 'alignment-span']);

interface Row {
  id: EntityId;
  type: EntityType;
  path_before: string | null;
  path_after: string | null;
  before: Data | null;
  after: Data | null;
  words_changed: boolean;
  had_words: boolean;
  first_segments: unknown[] | null;
  version_origin: { by?: string; checked?: boolean } | null;
  plain_body: string | null;
  paragraphs: number | null;
  forward: EntityId | null;
}

/**
 * One read for all the batch's items: each one's facts now and once
 * approved, without their words (a letter's words are a hundred times its
 * facts), whether the words change, the first paragraph, and where a merged
 * one goes. Each revision is unpacked once (a fenced lateral), not once for
 * every field read from it.
 */
const ITEMS_SQL = `
  SELECT p.entity_id AS id, p.entity_type AS type, e.path AS path_before, coalesce(p.path, e.path) AS path_after,
         d.before, d.after, d.words_changed, d.had_words, d.first_segments, d.version_origin, d.plain_body, d.paragraphs, f.to_id AS forward
    FROM (SELECT DISTINCT ON (entity_id) entity_id, entity_type, path, data FROM revision
           WHERE changeset_id = $1 AND merge_rev IS NULL ORDER BY entity_id, id DESC) p
    LEFT JOIN entity e ON e.id = p.entity_id AND NOT e.deleted AND e.main_rev IS NOT NULL
    LEFT JOIN revision m ON m.id = e.main_rev
    CROSS JOIN LATERAL (
      SELECT b - 'body' AS before, a - 'body' AS after,
             a IS NOT NULL AND (a->'body') IS DISTINCT FROM (b->'body') AS words_changed, coalesce(b ? 'body', false) AS had_words,
             CASE WHEN jsonb_typeof(a->'body'->'versions'->0->'segments') = 'array' THEN jsonb_path_query_array(a->'body'->'versions'->0->'segments', '$[0 to 5]') END AS first_segments,
             CASE WHEN jsonb_typeof(a->'body') = 'object' THEN a->'body'->'versions'->0->'origin' END AS version_origin,
             CASE WHEN jsonb_typeof(a->'body') = 'string' THEN left(a->>'body', ${FIRST_WORDS * 2}) END AS plain_body,
             CASE WHEN jsonb_typeof(a->'body'->'versions'->0->'segments') = 'array' THEN jsonb_array_length(a->'body'->'versions'->0->'segments') END AS paragraphs
        FROM (SELECT p.data || '{}'::jsonb AS a, m.data || '{}'::jsonb AS b OFFSET 0) y OFFSET 0) d
    LEFT JOIN LATERAL (SELECT to_id FROM entity_forward WHERE from_id = p.entity_id AND changeset_id = $1 LIMIT 1) f ON true`;

const linkKey = (link: Link) => `${link.parent} ${link.field}`;
const orderKey = (data: Data | null, link: Link | undefined) => {
  if (!data) return '';
  const own = link?.field === 'set' ? (data.orderIn as Data | undefined)?.[link.parent] : undefined;
  return `${typeof own === 'string' ? own : ''}|${typeof data.order === 'string' ? data.order : ''}`;
};
const lastOfPath = (path: string | null) => (path ? decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) : null);

/** A fact as one short line: Hebrew first for a name, a list joined, anything bigger cut. */
export function factLine(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  let line: string;
  if (typeof value === 'string') line = value;
  else if (typeof value === 'number' || typeof value === 'boolean') line = String(value);
  else if (Array.isArray(value) && value.every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) line = value.join(', ');
  else if (typeof value === 'object' && !Array.isArray(value) && (typeof (value as Data).he === 'string' || typeof (value as Data).en === 'string'))
    line = String((value as Data).he ?? (value as Data).en);
  else line = JSON.stringify(value);
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The words of a paragraph: its runs' text, joined. */
function wordsOf(segment: unknown): string | null {
  const text = (segment as { text?: unknown } | null)?.text;
  if (typeof text === 'string') return text;
  if (Array.isArray(text)) return text.map((run) => (typeof run === 'string' ? run : typeof (run as Data)?.text === 'string' ? (run as Data).text : '')).join('');
  return null;
}

/** Every item the batch changes, each with its kinds, in the order of its path. */
async function itemsOf(catalog: Catalog, changesetId: number): Promise<BatchItem[]> {
  await catalog.changeset(changesetId).catch(() => {
    throw notFound(`suggestion ${changesetId}`);
  });
  const { rows } = await catalog.db.query<Row>(ITEMS_SQL, [changesetId]);

  // The places named: every parent before and after, and where merged ones go. Main's names, or the batch's own for one it makes.
  const ids = new Set<string>();
  for (const row of rows) {
    for (const link of [...linksOf(row.type, row.before), ...linksOf(row.type, row.after)]) ids.add(link.parent);
    if (row.forward) ids.add(row.forward);
  }
  const places = new Map<string, BatchPlace>();
  if (ids.size) {
    const named = await catalog.db.query<{
      id: EntityId;
      path: string | null;
      data: Data | null;
    }>(
      `SELECT e.id, e.path, jsonb_build_object('name', r.data->'name', 'title', r.data->'title', 'label', r.data->'label') AS data
         FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = ANY($1::text[]) AND NOT e.deleted`,
      [[...ids]],
    );
    for (const row of named.rows)
      places.set(row.id, {
        id: row.id,
        name: readableName(row.data) ?? lastOfPath(row.path) ?? row.id,
        path: row.path,
      });
  }
  for (const row of rows)
    if (ids.has(row.id) && !places.has(row.id) && row.after)
      places.set(row.id, {
        id: row.id,
        name: readableName(row.after) ?? lastOfPath(row.path_after) ?? row.id,
        path: row.path_after,
      });
  const place = (id: EntityId | undefined | null): BatchPlace | null => (id ? (places.get(id) ?? { id, name: id, path: null }) : null);

  const items = rows.map((row): BatchItem => {
    const { before, after } = row;
    const nameBefore = before ? (readableName(before) ?? lastOfPath(row.path_before) ?? row.id) : null;
    const nameAfter = after ? (readableName(after) ?? lastOfPath(row.path_after) ?? row.id) : null;
    const item: BatchItem = {
      id: row.id,
      type: row.type,
      kinds: [],
      name: nameAfter ?? nameBefore ?? row.id,
      path: after ? row.path_after : row.path_before,
    };
    const was = linksOf(row.type, before);
    const will = linksOf(row.type, after);
    if (!after) {
      if (row.forward) {
        item.kinds.push('merged');
        item.into = place(row.forward);
      } else item.kinds.push('deleted');
      item.from = place(was[0]?.parent);
      return item;
    }
    if (WORD_TYPES.has(row.type)) {
      if (!before) item.kinds.push('new');
      item.kinds.push('words');
      item.words = { paragraphs: 1, first: null, added: !before, machine: false };
      return item;
    }
    if (!before) {
      item.kinds.push('new');
      item.to = place(will[0]?.parent);
    } else {
      const left = was.filter((l) => !will.some((w) => linkKey(w) === linkKey(l)));
      const came = will.filter((w) => !was.some((l) => linkKey(l) === linkKey(w)));
      if (left.length || came.length) {
        item.kinds.push('moved');
        item.from = place(left[0]?.parent);
        item.to = place(came[0]?.parent);
      } else if (was.some((l) => orderKey(before, l) !== orderKey(after, l))) item.kinds.push('reordered');
      if (nameBefore !== nameAfter) {
        item.kinds.push('renamed');
        item.was = nameBefore!;
      }
      const facts: BatchFact[] = [];
      for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (PLACE_FIELDS.has(field) || WORD_FIELDS.has(field) || same(before[field], after[field])) continue;
        // The name's own field is said as a rename; another name field (an English title) as a fact.
        if (NAME_FIELDS.has(field) && item.was !== undefined && factLine(before[field]) !== factLine(after[field])) continue;
        let [then, now] = [factLine(before[field]), factLine(after[field])];
        // A name whose Hebrew stays and English changes says the English.
        if (then === now && NAME_FIELDS.has(field)) [then, now] = [factLine((before[field] as Data | undefined)?.en), factLine((after[field] as Data | undefined)?.en)];
        facts.push({ field, before: then, after: now });
      }
      if (facts.length) {
        item.kinds.push('relabelled');
        item.facts = facts.slice(0, MAX_FACTS);
      }
    }
    if (row.words_changed) {
      item.kinds.push('words');
      const source = after.bodySource as { rights?: RightsState } | undefined;
      const shown = !source?.rights || mayExport(source.rights);
      // The first paragraphs, since the first is often only the date line.
      const first = shown ? (row.first_segments ?? []).map(wordsOf).filter(Boolean).join(' ') || row.plain_body : null;
      const origin = row.version_origin ?? (row.first_segments?.[0] as { origin?: { by?: string; checked?: boolean } } | undefined)?.origin;
      item.words = {
        paragraphs: row.paragraphs ?? (row.plain_body ? 1 : 0),
        first: first ? first.replace(/\s+/g, ' ').trim().slice(0, FIRST_WORDS) : null,
        added: !row.had_words,
        machine: !!origin?.by && origin.checked !== true,
      };
    }
    return item;
  });
  const collator = new Intl.Collator('he', { numeric: true });
  return items.sort((a, b) => collator.compare(a.path ?? '~', b.path ?? '~') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The words an item is found by: its names, its places, its facts and first words, as search writes them. */
function haystack(item: BatchItem): string {
  return normalizeSearchText(
    [item.name, item.was, item.path, item.id, item.from?.name, item.to?.name, item.into?.name, ...(item.facts ?? []).flatMap((f) => [f.before, f.after]), item.words?.first].filter(Boolean).join(' '),
  );
}

/**
 * The samples of one kind, in list order: the first and the last, then the
 * odd ones (the way the fewest go, the shortest name, the longest or most
 * changed), then the middle, up to five.
 */
function samplesOf(items: BatchItem[], kind: ChangeKind, flowCount: (item: BatchItem) => number): BatchItem[] {
  if (items.length <= SAMPLES) return items;
  const at = new Set<number>([0, items.length - 1]);
  const pick = (score: (item: BatchItem, i: number) => number) => {
    if (at.size >= SAMPLES) return;
    let best = -1;
    let top = -Infinity;
    items.forEach((item, i) => {
      const value = score(item, i);
      if (!at.has(i) && value > top) [best, top] = [i, value];
    });
    if (best >= 0) at.add(best);
  };
  if (kind === 'moved' || kind === 'new' || kind === 'merged') pick((item) => -flowCount(item));
  pick((item) => -item.name.length);
  pick((item) => item.name.length + item.kinds.length * 1000);
  pick((_, i) => -Math.abs(i - items.length / 2));
  return [...at].sort((a, b) => a - b).map((i) => items[i]!);
}

export async function batchReview(catalog: Catalog, changesetId: number, query: BatchReviewQuery = {}): Promise<BatchReview> {
  const items = await itemsOf(catalog, changesetId);
  const counts: Partial<Record<ChangeKind, number>> = {};
  for (const item of items) for (const kind of item.kinds) counts[kind] = (counts[kind] ?? 0) + 1;

  // Where things go: by the place each comes from and goes to.
  const wayOf = (item: BatchItem) => (['moved', 'new', 'merged'] as const).find((way) => item.kinds.includes(way));
  const flowKey = (item: BatchItem) => `${wayOf(item)} ${item.from?.id ?? ''}>${item.to?.id ?? item.into?.id ?? ''}`;
  const flowMap = new Map<string, BatchFlow>();
  for (const item of items) {
    const way = wayOf(item);
    if (!way) continue;
    const key = flowKey(item);
    const flow = flowMap.get(key) ?? {
      way,
      from: item.from ?? null,
      to: item.to ?? item.into ?? null,
      count: 0,
    };
    flow.count++;
    flowMap.set(key, flow);
  }
  const flows = [...flowMap.values()].sort((a, b) => b.count - a.count);
  const flowCount = (item: BatchItem) => flowMap.get(flowKey(item))?.count ?? 0;

  const samples = CHANGE_KINDS.filter((kind) => counts[kind]).map((kind) => ({
    kind,
    items: samplesOf(
      items.filter((i) => i.kinds.includes(kind)),
      kind,
      flowCount,
    ),
  }));

  const kind = query.kind && CHANGE_KINDS.includes(query.kind) ? query.kind : null;
  const q = (query.q ?? '').trim().slice(0, 100);
  const words = normalizeSearchText(q).split(' ').filter(Boolean);
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(Math.max(1, query.limit ?? 30), 100);
  const found = items.filter((item) => (!kind || item.kinds.includes(kind)) && (!words.length || words.every((w) => haystack(item).includes(w))));
  return {
    items: items.length,
    counts,
    machine: items.filter((item) => item.words?.machine).length,
    flows: flows.slice(0, MAX_FLOWS),
    flowsMore: Math.max(0, flows.length - MAX_FLOWS),
    samples,
    list: {
      kind,
      q,
      offset,
      limit,
      total: found.length,
      rows: found.slice(offset, offset + limit),
    },
  };
}
