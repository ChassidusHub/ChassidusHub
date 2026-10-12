/**
 * A catalog batch as the back room's review queue reads it (Flow): a
 * Suggestion that changes the tree (shelves, sefarim, sichos, farbrengens),
 * sent by the Catalog team with its research note as the description, and
 * the tree before and after it that the API draws (GET
 * /v1/suggestions/:id/tree, core batchTree.ts). The same on the server and
 * in the browser.
 */

/** What happens to an item in its parent. */
export type TreeMark = 'same' | 'out' | 'in' | 'new' | 'gone' | 'renamed' | 'moved';

export interface TreeRow {
  id: string;
  type: string;
  name: string;
  path: string | null;
  mark: TreeMark;
  was?: string;
  addition?: boolean;
}
export interface TreeGap {
  gap: number;
  mark?: TreeMark;
}
export type TreeLine = TreeRow | TreeGap;

export interface TreeGroup {
  parent: {
    id: string;
    type: string;
    name: string;
    path: string | null;
    isNew: boolean;
    gone: boolean;
  };
  before: TreeLine[];
  after: TreeLine[];
  counts: { before: number; after: number };
  changes: number;
}

export interface BatchTree {
  groups: TreeGroup[];
  more: number;
  items: number;
  elsewhere: number;
}

/** Items of these kinds are the tree itself; a suggestion that changes one of them is a catalog batch. */
const TREE_TYPES: ReadonlySet<string> = new Set(['set', 'work', 'unit', 'event', 'publication', 'recording']);

/** Whether a listed suggestion (with the kinds of items it changes) is a catalog batch, not a fix to words. */
export const isBatch = (types: readonly string[] | undefined) => !!types?.some((type) => TREE_TYPES.has(type));

/** One open batch in the queue. */
export interface QueueRow {
  id: number;
  number: number | null;
  title: string;
  author: string;
  at: string | null;
}

/** The open batches from the list of open suggestions (newest first by number), oldest first: the queue is worked from its start. */
export function queueOf(suggestions: readonly Record<string, unknown>[]): QueueRow[] {
  return suggestions
    .filter((s) => s.status === 'open' && isBatch(s.types as string[] | undefined))
    .map((s) => ({
      id: Number(s.id),
      number: typeof s.number === 'number' ? s.number : null,
      title: String(s.title ?? ''),
      author: String(s.author ?? ''),
      at: (s.submittedAt ?? s.submitted_at ?? s.createdAt ?? s.created_at ?? null) as string | null,
    }))
    .reverse();
}

/** Where this batch stands in the queue, and the ones beside it. */
export function placeIn(
  queue: readonly QueueRow[],
  id: number,
): {
  at: number;
  of: number;
  previous: QueueRow | null;
  next: QueueRow | null;
} {
  const at = queue.findIndex((row) => row.id === id);
  if (at < 0) return { at: -1, of: queue.length, previous: null, next: queue[0] ?? null };
  return {
    at,
    of: queue.length,
    previous: queue[at - 1] ?? null,
    next: queue[at + 1] ?? null,
  };
}

/** Each mark in a word or two, said beside the item (and to a screen reader), never by colour alone. */
export const MARK_WORDS: Record<Exclude<TreeMark, 'same'>, string> = {
  out: 'יוצא',
  in: 'נכנס',
  new: 'חדש',
  gone: 'נמחק',
  renamed: 'שם חדש',
  moved: 'מקום חדש',
};

/** The same, for more than one. */
const MARKS_WORDS: Record<Exclude<TreeMark, 'same'>, string> = {
  out: 'יוצאים',
  in: 'נכנסים',
  new: 'חדשים',
  gone: 'נמחקים',
  renamed: 'עם שם חדש',
  moved: 'במקום חדש',
};

/** Folded rows in words: "עוד 40", or "עוד 25 נכנסים" when they share a mark. */
export function gapWords(gap: TreeGap): string {
  const n = gap.gap.toLocaleString('he');
  if (!gap.mark || gap.mark === 'same') return gap.gap === 1 ? 'ועוד אחד' : `ועוד ${n}`;
  return `ועוד ${n} ${MARKS_WORDS[gap.mark]}`;
}

/** How many of a side's rows carry each mark: the line over a group ("3 נכנסים · 1 יוצא"). */
export function tally(group: TreeGroup): string {
  const count = new Map<TreeMark, number>();
  // What leaves is on the before side; what comes, and what is renamed or put in another place, on the after side.
  const add = (lines: TreeLine[], marks: TreeMark[]) => {
    for (const line of lines) if (line.mark && marks.includes(line.mark)) count.set(line.mark, (count.get(line.mark) ?? 0) + ('gap' in line ? line.gap : 1));
  };
  add(group.before, ['out', 'gone']);
  add(group.after, ['in', 'new', 'renamed', 'moved']);
  return [...count].map(([mark, n]) => `${n.toLocaleString('he')} ${(n === 1 ? MARK_WORDS : MARKS_WORDS)[mark as Exclude<TreeMark, 'same'>]}`).join(' · ');
}

/** What the person does when they send a batch back: a short note, or this when they write none. */
export const SENT_BACK = 'הוחזר מתור הקטלוג לבדיקה נוספת.';

/**
 * The same batch counted, sampled and listed, as the API reads it (GET
 * /v1/suggestions/:id/batch, core batchReview.ts): how many of each kind of
 * change, where things go, a few samples of each kind, and a page of the
 * whole list.
 */
export type ChangeKind = 'new' | 'moved' | 'merged' | 'renamed' | 'relabelled' | 'reordered' | 'words' | 'deleted';

export const CHANGE_KINDS: readonly ChangeKind[] = ['moved', 'merged', 'renamed', 'relabelled', 'reordered', 'new', 'words', 'deleted'];

export interface BatchPlace {
  id: string;
  name: string;
  path: string | null;
}

export interface BatchItem {
  id: string;
  type: string;
  kinds: ChangeKind[];
  name: string;
  was?: string;
  path: string | null;
  from?: BatchPlace | null;
  to?: BatchPlace | null;
  into?: BatchPlace | null;
  facts?: Array<{ field: string; before: string | null; after: string | null }>;
  words?: {
    paragraphs: number;
    first: string | null;
    added: boolean;
    machine: boolean;
  };
}

export interface BatchList {
  kind: ChangeKind | null;
  q: string;
  offset: number;
  limit: number;
  total: number;
  rows: BatchItem[];
}

export interface BatchReview {
  items: number;
  counts: Partial<Record<ChangeKind, number>>;
  machine: number;
  flows: Array<{
    way: 'moved' | 'new' | 'merged';
    from: BatchPlace | null;
    to: BatchPlace | null;
    count: number;
  }>;
  flowsMore: number;
  samples: Array<{ kind: ChangeKind; items: BatchItem[] }>;
  list: BatchList;
}

/** Each kind of change as the summary names it, and as a mark beside one item. */
export const KIND_WORDS: Record<ChangeKind, { many: string; one: string }> = {
  moved: { many: 'מועברים', one: 'מועבר' },
  merged: { many: 'מאוחדים', one: 'מאוחד' },
  renamed: { many: 'בשם חדש', one: 'שם חדש' },
  relabelled: { many: 'בפרטים חדשים', one: 'פרטים' },
  reordered: { many: 'במקום אחר בסדר', one: 'סדר' },
  new: { many: 'חדשים', one: 'חדש' },
  words: { many: 'עם טקסט', one: 'טקסט' },
  deleted: { many: 'נמחקים', one: 'נמחק' },
};

/** "120 מועברים · 3 בשם חדש": the batch in one line, for the confirm sheet and the summary's head. */
export function countsLine(counts: BatchReview['counts']): string {
  return CHANGE_KINDS.filter((kind) => counts[kind])
    .map((kind) => `${counts[kind]!.toLocaleString('he')} ${counts[kind] === 1 ? KIND_WORDS[kind].one : KIND_WORDS[kind].many}`)
    .join(' · ');
}

/** Facts by the names people know them by; others as the catalog names them. */
export const FACT_WORDS: Record<string, string> = {
  date: 'תאריך',
  position: 'מקום בספר',
  label: 'כותרת',
  title: 'שם',
  name: 'שם',
  recipient: 'נמען',
  recipients: 'נמענים',
  number: 'מספר',
  kind: 'סוג',
  editions: 'מהדורות',
  externalIds: 'מזהים חיצוניים',
  addition: 'תוספת',
  languages: 'שפות',
  language: 'שפה',
  authors: 'מחברים',
  genre: 'סוג',
};
