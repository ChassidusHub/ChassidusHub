/**
 * What a change did to the words, for the back room: each changed field of
 * a suggestion (its `changes`, from GET /v1/suggestions/:id?brief=1) made
 * plain text before and after, and the two compared word by word. A
 * paragraph's runs, a transcript's paragraph and a scan's line are all words
 * here; anything else (a name, a date) is shown as its field changed.
 */

export interface FieldChange {
  path: string;
  before?: unknown;
  after?: unknown;
}

/** One stretch of a comparison: words in both, words taken out, words put in. */
export type Piece = { kind: 'same' | 'gone' | 'new'; text: string };

/** A field's value as plain words: text, or a list of runs ({ text }), else null. */
export function plainOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((run) => run && typeof run === 'object')) {
    if (!value.some((run) => typeof (run as { text?: unknown }).text === 'string')) return null;
    return value.map((run) => (typeof (run as { text?: unknown }).text === 'string' ? (run as { text: string }).text : '')).join('');
  }
  if (value && typeof value === 'object' && Array.isArray((value as { text?: unknown }).text)) return plainOf((value as { text: unknown[] }).text);
  return null;
}

/**
 * The words before and after, compared: what both share at the start and the
 * end stays as it is, and what lies between is shown taken out and put in.
 * A fix changes a few words in one place, so this is all it needs.
 */
export function compare(before: string, after: string): Piece[] {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const pieces: Piece[] = [];
  const add = (kind: Piece['kind'], parts: string[]) => {
    const text = parts.join('');
    if (text) pieces.push({ kind, text });
  };
  add('same', a.slice(0, start));
  add('gone', a.slice(start, a.length - end));
  add('new', b.slice(start, b.length - end));
  add('same', a.slice(a.length - end));
  return pieces;
}

/** Around a change, only a few words of what stayed: enough to find the place. */
export function trimmed(pieces: Piece[], keep = 8): Piece[] {
  return pieces.map((piece, at) => {
    if (piece.kind !== 'same') return piece;
    const words = piece.text.split(/(\s+)/);
    if (words.length <= keep * 2) return piece;
    if (at === 0) return { kind: 'same', text: `… ${words.slice(-keep * 2).join('')}` };
    if (at === pieces.length - 1) return { kind: 'same', text: `${words.slice(0, keep * 2).join('')} …` };
    return { kind: 'same', text: `${words.slice(0, keep).join('')} … ${words.slice(-keep).join('')}` };
  });
}

/** Each changed field: its words compared, or (for anything that is not words) only that it changed. */
export function wordsOf(changes: FieldChange[]): ({ kind: 'words'; pieces: Piece[] } | { kind: 'field'; path: string })[] {
  return changes.map((change) => {
    const before = plainOf(change.before);
    const after = plainOf(change.after);
    if (before !== null && after !== null) return { kind: 'words', pieces: trimmed(compare(before, after)) };
    return { kind: 'field', path: change.path };
  });
}
