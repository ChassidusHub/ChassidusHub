import type { Lang } from './i18n.js';
import { diffStat, wordDiff } from './wordDiff.js';

/**
 * A suggestion's title as a sentence made from the change itself
 * (design/system, board 22): "תמלול [the recording]: 2 מילים תוקנו, פסקה
 * אחת נבדקה", where the sender left the title the site gives a transcript
 * fix. A title a person wrote is theirs, and kept as it is.
 */

/** The titles the site gives a fix on its own (core/sync.ts): a sentence says more. */
const MADE_TITLES = new Set(['תיקון תמלול']);

interface Entry {
  segment: { before: string; after: string } | null;
  transcript: { reported: boolean } | null;
}

const W = {
  transcript: { he: 'תמלול', en: 'Transcript' },
  oneWord: { he: 'מילה אחת תוקנה', en: '1 word fixed' },
  words: { he: '{n} מילים תוקנו', en: '{n} words fixed' },
  onePara: { he: 'פסקה אחת נבדקה', en: '1 paragraph checked' },
  paras: { he: '{n} פסקאות נבדקו', en: '{n} paragraphs checked' },
} as const;

export function suggestionSentence(view: { title: string; entries: Entry[]; where: { label: string; within: string | null } | null }, lang: Lang): string {
  const fixes = view.entries.filter((e) => e.transcript);
  if (!MADE_TITLES.has(view.title.trim()) || !fixes.length || fixes.length !== view.entries.length) return view.title;
  let words = 0;
  let checked = 0;
  for (const e of fixes) {
    if (e.transcript?.reported) checked++;
    if (e.segment && e.segment.before !== e.segment.after) {
      const { added, removed } = diffStat(wordDiff(e.segment.before, e.segment.after));
      words += Math.max(added, removed, 1);
    }
  }
  const parts = [
    words ? (words === 1 ? W.oneWord[lang] : W.words[lang].replace('{n}', words.toLocaleString(lang))) : '',
    checked ? (checked === 1 ? W.onePara[lang] : W.paras[lang].replace('{n}', checked.toLocaleString(lang))) : '',
  ].filter(Boolean);
  if (!parts.length) return view.title;
  const where = view.where?.within ?? view.where?.label;
  return `${W.transcript[lang]}${where ? ` ${where}` : ''}: ${parts.join(lang === 'he' ? ', ' : ', ')}`;
}
