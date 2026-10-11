/**
 * The Search screen's rows, as the page draws them. Shared by the page and
 * its loader; nothing here reads the API.
 */

/** One result as the Search screen draws it: a line, a quiet line under it, and where it opens. */
export interface Hit {
  /** What it is, for the top answer's small line: מאמר, שיחה, ספר, התוועדות… */
  kind: string;
  title: string;
  sub: string;
  to: string;
  /** Where to listen, when it has recordings. */
  listen?: string;
}

/** Words found inside a text: the words around them, where the query is in them, and whether a person has checked them. */
export interface WordHit {
  snippet: string;
  /** [start, end) offsets into `snippet` of the words to mark. */
  marks: number[][];
  sub: string;
  to: string;
  machine: boolean;
}

export interface SearchPage {
  query: string;
  top: Hit | null;
  works: Hit[];
  events: Hit[];
  words: WordHit[];
  /** The search did not answer; the page says so rather than "nothing found". */
  failed?: boolean;
}

/** What the API's kinds are called on the page. One it does not name yet is shown without a word for it. */
export const KIND: Record<string, string> = {
  sefer: 'ספר',
  shelf: 'מדף',
  book: 'דפוס',
  sicha: 'שיחה',
  maamar: 'מאמר',
  letter: 'מכתב',
  chapter: 'פרק',
  siman: 'סימן',
  farbrengen: 'התוועדות',
  event: 'התוועדות',
  recording: 'הקלטה',
  author: 'אישים',
};

/** A snippet cut at its marks: what <mark> wraps. Marks out of order or out of range are tidied, never trusted. */
export function markWords(snippet: string, marks: readonly (readonly number[])[]): { text: string; marked: boolean }[] {
  const out: { text: string; marked: boolean }[] = [];
  const push = (text: string, marked: boolean) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.marked === marked) last.text += text;
    else out.push({ text, marked });
  };
  let at = 0;
  for (const [start = 0, end = 0] of [...marks].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))) {
    const from = Math.max(at, Math.min(start, snippet.length));
    const to = Math.min(end, snippet.length);
    if (to <= from) continue;
    // A space between two marked words is marked too, so a phrase is one mark.
    const gap = snippet.slice(at, from);
    push(gap, /^\s+$/.test(gap) && out[out.length - 1]?.marked === true);
    push(snippet.slice(from, to), true);
    at = to;
  }
  push(snippet.slice(at), false);
  return out;
}
