import { isEntityId, type EntityId, type PageInline, type PageSegmentKind, type Language } from '@chassidushub/model';
import type { Catalog, ChangesetRow, NewRevision } from './catalog.js';
import { CatalogError, badState, invalid, notFound } from './errors.js';
import type { Json } from './merge.js';
import { applyWords, type WordsChange } from './pageWords.js';

/**
 * Your changes, not sent yet (docs/plans/redesign.md, migration 0029).
 *
 * Every block on a page in Edit writes the same thing when a person
 * changes it: an operation. They collect in the person's draft for that
 * page, kept here so the draft follows them from phone to computer, and
 * are sent together as one Suggestion: the operations are made on the
 * items as they are at that moment, each checked against what the person
 * saw (`before`), so a change someone made since is never overwritten.
 *
 *   set     one of an item's facts: `field` is a path in its data (`title.en`)
 *   words   a page's words, segment by segment, as pageWords.ts makes them
 *
 * Further kinds (moving and ordering, adding an item) join as the screens
 * that make them are built; the endpoints people and agents use today
 * stay as they are.
 */

export type DraftOp =
  | { key: string; op: 'set'; says: string; item: EntityId; field: string; value?: Json; before?: Json }
  | {
      key: string;
      op: 'words';
      says: string;
      item: EntityId;
      change: WordsChange;
      version?: string;
      segment?: string;
      text?: PageInline[];
      before?: PageInline[];
      kind?: PageSegmentKind;
      language?: Language;
    };

export interface Draft {
  place: string;
  title: string | null;
  ops: DraftOp[];
  updatedAt: string;
}

/** The most operations a draft holds, and its largest size in characters of JSON. */
export const MAX_DRAFT_OPS = 200;
export const MAX_DRAFT_JSON = 1_000_000;
/** How many drafts a person keeps; the oldest go first. */
export const MAX_DRAFTS = 100;

const FIELD = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$/;
/** Fields a draft does not set: what the catalog keeps for itself, and the words, which go segment by segment. */
const NOT_SET = new Set(['body', 'origin', 'bodySource', 'sources', 'externalIds']);

function text(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`each change needs ${what}`);
  return value.trim().slice(0, max);
}

/** One operation as the site sent it, checked and kept only in its known fields. */
export function readOp(raw: unknown): DraftOp {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('each change is an object');
  const o = raw as Record<string, unknown>;
  const key = text(o.key, 'a key', 300);
  const says = text(o.says, 'a sentence saying what it changes (says)', 300);
  if (typeof o.item !== 'string' || !isEntityId(o.item)) throw invalid(`"${key}": say which item it changes (item)`);
  const item = o.item as EntityId;
  if (o.op === 'set') {
    if (typeof o.field !== 'string' || !FIELD.test(o.field) || o.field.length > 200) throw invalid(`"${key}": the field is a path in the item's data, like title.en`);
    if (NOT_SET.has(o.field.split('.')[0]!)) throw invalid(`"${key}": ${o.field} is not changed this way`);
    return { key, op: 'set', says, item, field: o.field, ...('value' in o ? { value: o.value as Json } : {}), ...('before' in o ? { before: o.before as Json } : {}) };
  }
  if (o.op === 'words') {
    if (!['edit', 'add', 'remove', 'start', 'check'].includes(o.change as string)) throw invalid(`"${key}": the change is edit, add, remove, start or check`);
    const runs = (v: unknown) => (v === undefined ? undefined : Array.isArray(v) ? (v as PageInline[]) : (() => { throw invalid(`"${key}": words are a list of runs`); })());
    return {
      key,
      op: 'words',
      says,
      item,
      change: o.change as WordsChange,
      ...(typeof o.version === 'string' ? { version: o.version } : {}),
      ...(typeof o.segment === 'string' ? { segment: o.segment } : {}),
      ...(o.text !== undefined ? { text: runs(o.text) } : {}),
      ...(o.before !== undefined ? { before: runs(o.before) } : {}),
      ...(typeof o.kind === 'string' ? { kind: o.kind as PageSegmentKind } : {}),
      ...(typeof o.language === 'string' ? { language: o.language as Language } : {}),
    };
  }
  throw invalid(`"${key}": the change is set or words`);
}

function readOps(raw: unknown): DraftOp[] {
  if (!Array.isArray(raw)) throw invalid('give the changes as a list (ops)');
  if (raw.length > MAX_DRAFT_OPS) throw invalid(`a draft holds up to ${MAX_DRAFT_OPS} changes; send these first`);
  const ops = raw.map(readOp);
  if (new Set(ops.map((o) => o.key)).size !== ops.length) throw invalid('a change is given twice (the same key)');
  if (JSON.stringify(ops).length > MAX_DRAFT_JSON) throw invalid('this draft is too large; send it first');
  return ops;
}

function place(value: unknown): string {
  if (typeof value !== 'string' || !isEntityId(value)) throw invalid("a draft is for one page: give the page's id");
  return value;
}

type Row = { place: string; title: string | null; ops: DraftOp[] | string; updated_at: Date | string };
const toDraft = (r: Row): Draft => ({ place: r.place, title: r.title, ops: typeof r.ops === 'string' ? (JSON.parse(r.ops) as DraftOp[]) : r.ops, updatedAt: new Date(r.updated_at).toISOString() });

/** Keeps `by`'s draft for a page, replacing what was kept: the site sends the whole list each time. An empty list forgets it. */
export async function saveDraft(catalog: Catalog, by: string, input: { place?: unknown; title?: unknown; ops?: unknown }): Promise<Draft | null> {
  const where = place(input.place);
  const ops = readOps(input.ops);
  if (!ops.length) {
    await forgetDraft(catalog, by, where);
    return null;
  }
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 300) : null;
  const { rows } = await catalog.db.query<Row>(
    `INSERT INTO auth.draft (account_id, place, title, ops, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (account_id, place) DO UPDATE SET title = coalesce(excluded.title, auth.draft.title), ops = excluded.ops, updated_at = now()
     RETURNING place, title, ops, updated_at`,
    [by, where, title, JSON.stringify(ops)],
  );
  await catalog.db.query(
    `DELETE FROM auth.draft WHERE account_id = $1 AND place NOT IN (
       SELECT place FROM auth.draft WHERE account_id = $1 ORDER BY updated_at DESC LIMIT ${MAX_DRAFTS})`,
    [by],
  );
  return toDraft(rows[0]!);
}

/** `by`'s draft for one page, or null. */
export async function getDraft(catalog: Catalog, by: string, page: string): Promise<Draft | null> {
  const { rows } = await catalog.db.query<Row>('SELECT place, title, ops, updated_at FROM auth.draft WHERE account_id = $1 AND place = $2', [by, place(page)]);
  return rows[0] ? toDraft(rows[0]) : null;
}

/** `by`'s drafts, the latest first: Contribute → Yours. */
export async function listDrafts(catalog: Catalog, by: string, limit = 50): Promise<Draft[]> {
  const { rows } = await catalog.db.query<Row>(
    `SELECT place, title, ops, updated_at FROM auth.draft WHERE account_id = $1 ORDER BY updated_at DESC LIMIT ${Math.min(Math.max(limit, 1), MAX_DRAFTS)}`,
    [by],
  );
  return rows.map(toDraft);
}

export async function forgetDraft(catalog: Catalog, by: string, page: string): Promise<void> {
  await catalog.db.query('DELETE FROM auth.draft WHERE account_id = $1 AND place = $2', [by, place(page)]);
}

const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted((value as Record<string, unknown>)[k])]));
  return value;
}

/** The item's data with one fact set (or taken out, when `value` is left out); `before` must still be what it is. */
export function applySet(data: Record<string, unknown>, op: Extract<DraftOp, { op: 'set' }>): Record<string, unknown> {
  const path = op.field.split('.');
  const now = path.reduce<unknown>((at, step) => (at && typeof at === 'object' && !Array.isArray(at) ? (at as Record<string, unknown>)[step] : undefined), data);
  if ('before' in op && !same(op.before ?? null, now ?? null)) {
    throw new CatalogError('conflict', `${op.says}: someone changed this since you opened it; open it again to see it as it is now`, { key: op.key });
  }
  const out = structuredClone(data);
  let at: Record<string, unknown> = out;
  for (const step of path.slice(0, -1)) {
    const next = at[step];
    if (next !== undefined && (typeof next !== 'object' || next === null || Array.isArray(next))) throw invalid(`${op.says}: ${op.field} cannot be set inside a ${Array.isArray(next) ? 'list' : typeof next}`);
    at = (at[step] ??= {}) as Record<string, unknown>;
  }
  const last = path.at(-1)!;
  if (op.value === undefined || op.value === null) delete at[last];
  else at[last] = op.value;
  return out;
}

/**
 * Sends `by`'s draft for a page as one Suggestion: every operation made on
 * its item as it is now, in order. A change that no longer fits (someone
 * changed that thing since) stops the send with `detail.key` naming it, and
 * nothing is sent; the draft is kept. Sent, the draft is forgotten; where
 * the author's changes go live at once, the Suggestion comes back merged.
 */
export async function sendDraft(catalog: Catalog, by: string, input: { place?: unknown; title?: unknown; note?: unknown }): Promise<ChangesetRow> {
  const where = place(input.place);
  const draft = await getDraft(catalog, by, where);
  if (!draft || !draft.ops.length) throw badState('there are no changes to send');
  const order: EntityId[] = [];
  for (const op of draft.ops) if (!order.includes(op.item)) order.push(op.item);
  const items = new Map((await catalog.getMany(order)).map((e) => [e.id, e]));
  const revisions: NewRevision[] = [];
  for (const id of order) {
    const entity = items.get(id);
    if (!entity || entity.data === null) throw notFound(`item ${id}`);
    let data = entity.data as Record<string, unknown>;
    for (const op of draft.ops.filter((o) => o.item === id)) {
      try {
        data = op.op === 'set' ? applySet(data, op) : applyWords(data, op);
      } catch (error) {
        if (error instanceof CatalogError && !(error.detail && typeof error.detail === 'object' && 'key' in error.detail)) throw new CatalogError(error.code, `${op.says}: ${error.message}`, { key: op.key });
        throw error;
      }
    }
    revisions.push({ id, type: entity.type, data: data as Json });
  }
  const says = draft.ops.map((o) => o.says);
  const asked = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : '';
  const title = asked || (says.length === 1 ? says[0]! : `${says[0]!} and ${says.length - 1} more`).slice(0, 200);
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 2000) : undefined;
  const lines = says.map((s) => `- ${s}`).join('\n');
  const suggestion = await catalog.createChangeset(by, { title, description: note ? `${note}\n\n${lines}` : lines });
  await catalog.putRevisions(suggestion.id, by, revisions);
  const sent = await catalog.submit(suggestion.id, by);
  await forgetDraft(catalog, by, where);
  return sent;
}
