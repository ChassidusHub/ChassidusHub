import type { PageInline } from '@chassidushub/model';

/**
 * Putting a person's words in place of the words they selected, as the API's
 * POST /v1/fix wants them: the whole segment before and after. The browser
 * knows only what it drew (the page's HTML); the server knows the segment's
 * runs, so this runs on the server (routes/fix.ts) with where the selection
 * starts in the segment's drawn text.
 *
 * The drawn text is what the reader's HTML gives as text (words.server.ts):
 * a text run its words, a footnote's mark its label, a marker its letters,
 * and nothing for a line break or a printed line's end. A fix may change
 * words only: a selection that takes in a footnote's mark or a marker is
 * refused, so a note is never lost by a fix.
 */

/** Why a selection cannot be put in place. */
export type NotPlaced = 'moved' | 'not-words';

/** What a run shows as text in the reader. */
function shown(run: PageInline, labels: ReadonlyMap<string, string>): string {
  if ('text' in run) return run.text;
  if ('note' in run) return labels.get(run.note) ?? '*';
  if ('marker' in run) return run.marker;
  return '';
}

/**
 * Where the selected words are: at `at` when they are there, else the one
 * place they are found (the words drawn may have moved by a fix a moment
 * ago). Two or more places, or none, and nobody can say which was meant.
 */
function placeOf(text: string, selected: string, at: number): number | null {
  if (text.slice(at, at + selected.length) === selected) return at;
  const first = text.indexOf(selected);
  if (first < 0 || text.indexOf(selected, first + 1) >= 0) return null;
  return first;
}

/** Replaces `selected`, found at `at` in the segment's drawn text, with `words`; the runs around it are kept as they are. */
export function replaceInRuns(runs: readonly PageInline[], labels: ReadonlyMap<string, string>, at: number, selected: string, words: string): PageInline[] | NotPlaced {
  const drawn = runs.map((run) => shown(run, labels));
  const start = placeOf(drawn.join(''), selected, at);
  if (start === null || !selected) return 'moved';
  const end = start + selected.length;

  const out: PageInline[] = [];
  let pos = 0;
  let placed = false;
  for (const [index, run] of runs.entries()) {
    const from = pos;
    const to = pos + drawn[index]!.length;
    pos = to;
    // Untouched: wholly before or after the selection (a line end sitting at its edge stays too).
    if (to <= start || from >= end) {
      out.push(run);
      continue;
    }
    if (!('text' in run)) return 'not-words';
    const keepBefore = run.text.slice(0, Math.max(0, start - from));
    const keepAfter = run.text.slice(Math.max(0, end - from));
    // The new words go in the first run the selection touches, with its marks; the rest of the selection's runs give up their part.
    const text = keepBefore + (placed ? '' : words) + keepAfter;
    placed = true;
    if (text) out.push({ ...run, text });
  }
  return out;
}

/** The same for plain words (a transcript's paragraph). */
export function replaceInText(text: string, at: number, selected: string, words: string): string | NotPlaced {
  const start = placeOf(text, selected, at);
  if (start === null || !selected) return 'moved';
  return text.slice(0, start) + words + text.slice(start + selected.length);
}

/** How many words differ between what was selected and what was typed: the sheet says when a reviewer will look first (more than 5). */
export function wordsDiffering(before: string, after: string): number {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  // The words the two share at the start and at the end are not changed; what is left between is.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return Math.max(a.length - head - tail, b.length - head - tail);
}

/** At most this many words go live at once (RFC 0001); more wait for a reviewer. */
export const LIVE_WORDS = 5;
