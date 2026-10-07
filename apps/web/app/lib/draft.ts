/**
 * Your changes, not sent yet: the tray at the foot of a page in Edit.
 *
 * Every block on a page (a title, a paragraph's words, a list of contents)
 * writes the same thing when a person changes it: an operation. They
 * collect here, a draft for each place, until the person sends them as one
 * Suggestion. A second change to the same thing replaces the first, so the
 * tray counts things changed, not keystrokes.
 *
 * The draft is kept in this browser at once, and for a signed-in person on
 * their account too (/_/drafts, the API's /v1/drafts), a moment after the
 * last change, so it follows them from phone to computer.
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

const SYNC_AFTER_MS = 1500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Keeps the draft on the person's account, a moment after the last change. Signed out, the API says no and the browser's copy is all there is. */
function syncSoon(draft: Draft): void {
  if (typeof fetch === 'undefined' || typeof window === 'undefined') return;
  clearTimeout(timers.get(draft.place));
  timers.set(draft.place, setTimeout(() => void pushDraft(draft.place), SYNC_AFTER_MS));
}

async function pushDraft(place: string): Promise<boolean> {
  clearTimeout(timers.get(place));
  timers.delete(place);
  const draft = read(place);
  try {
    const response = await fetch(`/_/drafts/${place}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: draft.ops }) });
    return response.ok;
  } catch {
    return false;
  }
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
  syncSoon(draft);
}

/** What `/_/drafts/<place>/send` answers: the Suggestion made, or what stopped it (`key`: the change that no longer fits). */
export type SendResult = { ok: true; number: number | null; status: string } | { ok: false; status: number; message: string; key?: string };

/** The store the page's blocks share: read, change, and be told of changes (React's useSyncExternalStore). */
export const drafts = {
  get: read,
  /** An empty draft for the server's first drawing: nothing of the browser's is known there. */
  empty: (place: string): Draft => ({ place, ops: [] }),
  put: (place: string, op: DraftOp) => write(withOp(read(place), op)),
  remove: (place: string, key: string) => write(withoutOp(read(place), key)),
  undo: (place: string) => write(undoLast(read(place))),
  clear: (place: string) => write({ place, ops: [] }),
  /** Takes the account's draft for a page when this browser has none (opened on another device). */
  async pull(place: string): Promise<void> {
    if (read(place).ops.length || typeof fetch === 'undefined') return;
    try {
      const response = await fetch(`/_/drafts/${place}`, { headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const { draft } = (await response.json()) as { draft: { ops: DraftOp[] } | null };
      if (draft?.ops?.length && !read(place).ops.length) {
        cache.set(place, { place, ops: draft.ops });
        for (const listener of listeners.get(place) ?? []) listener();
      }
    } catch {
      // Offline or signed out: the browser's copy stands.
    }
  },
  /** Sends the page's draft as one Suggestion; forgotten here once it is sent. */
  async send(place: string, input: { title?: string; note?: string } = {}): Promise<SendResult> {
    if (!(await pushDraft(place))) return { ok: false, status: 401, message: 'Sign in to send your changes.' };
    const response = await fetch(`/_/drafts/${place}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const body = (await response.json().catch(() => ({}))) as { number?: number | null; status?: string; error?: string; message?: string; detail?: { key?: string } };
    if (!response.ok) return { ok: false, status: response.status, message: body.message ?? body.error ?? 'The changes were not sent.', key: body.detail?.key };
    cache.set(place, { place, ops: [] });
    try {
      globalThis.localStorage?.removeItem(STORE + place);
    } catch {
      // Nothing kept to remove.
    }
    for (const listener of listeners.get(place) ?? []) listener();
    return { ok: true, number: body.number ?? null, status: body.status ?? 'open' };
  },
  /** Every draft this browser keeps, for the Yours list. */
  local(): Draft[] {
    const out: Draft[] = [];
    try {
      const store = globalThis.localStorage;
      for (let i = 0; store && i < store.length; i++) {
        const name = store.key(i);
        if (name?.startsWith(STORE)) out.push(read(name.slice(STORE.length)));
      }
    } catch {
      // Blocked storage: none kept here.
    }
    return out.filter((d) => d.ops.length);
  },
  /** The signed-in person's drafts on their account, from every device; none when signed out. */
  async list(): Promise<Draft[]> {
    try {
      const response = await fetch('/_/drafts/', { headers: { accept: 'application/json' } });
      if (!response.ok) return [];
      const body = (await response.json()) as { drafts?: Array<{ place: string; ops: DraftOp[] }> };
      return (body.drafts ?? []).map((d) => ({ place: d.place, ops: d.ops }));
    } catch {
      return [];
    }
  },
  subscribe(place: string, listener: Listener): () => void {
    const set = listeners.get(place) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(place, set);
    return () => set.delete(listener);
  },
};
