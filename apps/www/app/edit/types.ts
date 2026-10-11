/** One field of a page changed in Edit (routes/edit.ts): which item, which field, what it was and what it is now. */
export interface EditAsk {
  item: string;
  /** The revision the page showed: if the item changed since, nothing is sent. */
  rev: number;
  /** The page's name, in one language. */
  field: 'label';
  language: 'he' | 'en';
  before: string;
  value: string;
}

/** Saved (live at once for a trusted person, else waiting for a second look), or not, with why. */
export type EditAnswer = { ok: true; live: boolean; suggestion: number; rev?: number } | { ok: false; why: 'signin' | 'changed' | 'empty' | 'refused' | 'down' };
