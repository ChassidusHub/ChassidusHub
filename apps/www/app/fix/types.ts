/** What the page sends to fix words (routes/fix.ts): where the selected words are, and what the person typed. */
export interface FixAsk {
  /** A sicha's words (`body`), one of its footnotes (`note`), or a recording's paragraph (`transcript`). */
  kind: 'body' | 'note' | 'transcript';
  /** The item: the unit, or the recording. */
  item: string;
  /** The body's version, as the page shows it (he, en). */
  version?: string;
  /** The segment's id: a paragraph's, a footnote's, a transcript paragraph's. */
  segment: string;
  /** Where the selection starts in the segment's text as the page drew it. */
  at: number;
  /** The words selected, as the page shows them. */
  selected: string;
  /** What the person typed in their place. */
  words: string;
}

/**
 * The answer: sent (live now, or waiting for a reviewer, with why), or not
 * sent, with why: signed out, the words changed since the page was opened,
 * the selection takes in more than words (a footnote's mark), too many fixes
 * today, the API refused it, or it could not be reached.
 */
export type FixAnswer =
  | { ok: true; changeset: number; live: boolean; reason?: string }
  | { ok: false; why: 'signin' | 'changed' | 'not-words' | 'busy' | 'empty' | 'refused' | 'down'; message?: string };

export type UndoAnswer = { ok: true } | { ok: false; why: 'signin' | 'late' | 'refused' | 'down'; message?: string };
