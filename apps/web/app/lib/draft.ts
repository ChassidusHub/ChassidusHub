/**
 * Your changes, not sent yet: the tray at the foot of a page in Edit.
 *
 * Every block on a page (a title, a paragraph's words, a list of contents)
 * writes the same thing when a person changes it: an operation. They
 * collect here, a draft for each place, until the person sends them as one
 * Suggestion. A second change to the same thing replaces the first, so the
 * tray counts things changed, not keystrokes.
 *
 * For now the draft is kept in this browser; the server keeps it once the
 * drafts API is in (step 2 of the redesign), so it follows a person from
 * phone to computer.
 */

/** What changed. `key` names the thing (an item's field, a paragraph): a later change to the same key replaces the earlier. */
export interface DraftOp {
  key: string;
  op: string;
  /** One sentence for the tray and the Send sheet: "Renamed the sefer". */
  says: string;
  [field: string]: unknown;
}

export interface Draft {
  /** The page the changes were made on: its permanent id. */
  place: string;
  ops: DraftOp[];
}

/** The draft with this operation in it: put in place of an earlier one with the same key, else added at the end. */
export function withOp(draft: Draft, op: DraftOp): Draft {
  const at = draft.ops.findIndex((o) => o.key === op.key);
  if (at === -1) return { ...draft, ops: [...draft.ops, op] };
  return { ...draft, ops: draft.ops.map((o, i) => (i === at ? op : o)) };
}

/** The draft without the operation on this key: undoing one change. */
export function withoutOp(draft: Draft, key: string): Draft {
  return { ...draft, ops: draft.ops.filter((o) => o.key !== key) };
}

/** The draft without its last change. */
export function undoLast(draft: Draft): Draft {
  return { ...draft, ops: draft.ops.slice(0, -1) };
}

const STORE = 'chassidushub:draft:';
type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, Draft>();

function read(place: string): Draft {
  const kept = cache.get(place);
  if (kept) return kept;
  let draft: Draft = { place, ops: [] };
  try {
    const raw = globalThis.localStorage?.getItem(STORE + place);
    const parsed = raw ? (JSON.parse(raw) as Draft) : null;
    if (parsed && Array.isArray(parsed.ops)) draft = { place, ops: parsed.ops };
  } catch {
    // A private window or blocked storage: the draft lives only while the page is open.
  }
  cache.set(place, draft);
  return draft;
}

function write(draft: Draft): void {
  cache.set(draft.place, draft);
  try {
    if (draft.ops.length) globalThis.localStorage?.setItem(STORE + draft.place, JSON.stringify(draft));
    else globalThis.localStorage?.removeItem(STORE + draft.place);
  } catch {
    // As above: kept in memory only.
  }
  for (const listener of listeners.get(draft.place) ?? []) listener();
}

/** The store the page's blocks share: read, change, and be told of changes (React's useSyncExternalStore). */
export const drafts = {
  get: read,
  /** An empty draft for the server's first drawing: nothing of the browser's is known there. */
  empty: (place: string): Draft => ({ place, ops: [] }),
  put: (place: string, op: DraftOp) => write(withOp(read(place), op)),
  remove: (place: string, key: string) => write(withoutOp(read(place), key)),
  undo: (place: string) => write(undoLast(read(place))),
  clear: (place: string) => write({ place, ops: [] }),
  subscribe(place: string, listener: Listener): () => void {
    const set = listeners.get(place) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(place, set);
    return () => set.delete(listener);
  },
};
