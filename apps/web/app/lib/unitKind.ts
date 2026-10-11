import type { Lang } from './i18n.js';

/**
 * What one piece of a sefer is called: a maamar in a sefer of maamarim, a
 * letter in the Igros, a sicha in a sefer of sichos (#91: Sefer HaMaamarim
 * Melukat said "52 sichos"). Read from the sefer's levels first (its last
 * level names its pieces), then its genre, then its name; a sefer that says
 * none of these gets the plain word "item" rather than a wrong one.
 */
export type UnitKind = 'maamar' | 'sicha' | 'letter' | 'item';

type Work = { genre?: unknown; levels?: unknown; title?: unknown; label?: unknown } | null | undefined;

const BY_LEVEL: Record<string, UnitKind> = { maamar: 'maamar', sicha: 'sicha', letter: 'letter', igeres: 'letter' };
const BY_GENRE: Record<string, UnitKind> = { maamarim: 'maamar', sichos: 'sicha', igros: 'letter' };

function names(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return Object.values(v).filter((x) => typeof x === 'string').join(' ');
  return '';
}

export function unitKind(work: Work): UnitKind {
  if (!work) return 'item';
  const levels = Array.isArray(work.levels) ? work.levels : [];
  const last = levels[levels.length - 1];
  const byLevel = typeof last === 'string' ? BY_LEVEL[last] : undefined;
  if (byLevel) return byLevel;
  const byGenre = typeof work.genre === 'string' ? BY_GENRE[work.genre] : undefined;
  if (byGenre) return byGenre;
  const name = names(work.title) + ' ' + names(work.label);
  if (/maamar|maamor|מאמר/i.test(name)) return 'maamar';
  if (/igros|igrot|letters|אגרות/i.test(name)) return 'letter';
  if (/sichos|sichot|שיחות/i.test(name)) return 'sicha';
  return 'item';
}

const NOUN: Record<UnitKind | 'printing', Record<Lang, [one: string, many: string]>> = {
  maamar: { he: ['מאמר', 'מאמרים'], en: ['maamar', 'maamarim'] },
  sicha: { he: ['שיחה', 'שיחות'], en: ['sicha', 'sichos'] },
  letter: { he: ['אגרת', 'אגרות'], en: ['letter', 'letters'] },
  item: { he: ['פריט', 'פריטים'], en: ['item', 'items'] },
  printing: { he: ['הדפסה', 'הדפסות'], en: ['printing', 'printings'] },
};

/** The noun for a count: "1 printing", "52 maamarim". */
export function nounFor(kind: UnitKind | 'printing', n: number, lang: Lang): string {
  const [one, many] = NOUN[kind][lang];
  return n === 1 ? one : many;
}

const NO_TEXT: Record<UnitKind, Record<Lang, string>> = {
  maamar: { he: 'למאמר הזה עוד אין טקסט כאן.', en: 'This maamar has no text here yet.' },
  sicha: { he: 'לשיחה הזאת עוד אין טקסט כאן.', en: 'This sicha has no text here yet.' },
  letter: { he: 'לאגרת הזאת עוד אין טקסט כאן.', en: 'This letter has no text here yet.' },
  item: { he: 'לפריט הזה עוד אין טקסט כאן.', en: 'This item has no text here yet.' },
};

/** What a piece with no words yet says, in its own kind's word. */
export function noTextFor(kind: UnitKind, lang: Lang): string {
  return NO_TEXT[kind][lang];
}
