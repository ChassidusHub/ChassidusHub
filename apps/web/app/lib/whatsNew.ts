import type { Lang } from './i18n.js';
import type { IconName } from '../ui/Icon.js';

/**
 * What is new on ChassidusHub, told the way a reader meets it: what they
 * can now hear or read, never as work waiting for review. Home shows these
 * as cards with a button to the page that lists them all (/new); both read
 * this one list, so they never say different things.
 *
 * Each says that a machine made it (AI), as everything a machine wrote is
 * labelled until a person checks it.
 */
export interface NewThing {
  key: string;
  icon: IconName;
  title: Record<Lang, string>;
  text: Record<Lang, string>;
  /** Where it is: a place on the site, or a section of /new. */
  to: string;
}

export const NEW_THINGS: NewThing[] = [
  {
    key: 'heard',
    icon: 'audio',
    title: { he: 'התוועדויות חשוון וכסלו, בתמלול AI', en: 'Cheshvan and Kislev farbrengens, transcribed by AI' },
    text: { he: 'לשמוע את הרבי והמילים לפניכם, מכל השנים.', en: 'Hear the Rebbe with the words before you, from every year.' },
    to: '/new#heard',
  },
  {
    key: 'likkutei-sichos',
    icon: 'book',
    title: { he: 'לקוטי שיחות: הטקסט', en: 'Likkutei Sichos: the text' },
    text: { he: 'נקרא מהסריקות ב־AI, כרך אחר כרך, עם ההערות במקומן.', en: 'Read from the scans by AI, volume by volume, with the notes in place.' },
    to: '/likkutei-sichos',
  },
  {
    key: 'sefer-hasichos',
    icon: 'book',
    title: { he: 'ספר השיחות תשמ״ז–תשנ״ב', en: 'Sefer HaSichos 5747–5752' },
    text: { he: 'כל שנים עשר הכרכים, נקראו מהסריקות ב־AI.', en: 'All twelve volumes, read from the scans by AI.' },
    to: '/sefer-hasichos-rebbe',
  },
];

/** The months of the newest transcripts, as the calendar keeps them (Tishrei is 01). */
export const NEW_MONTHS = [
  { month: '02', name: { he: 'חשוון', en: 'Cheshvan' } },
  { month: '03', name: { he: 'כסלו', en: 'Kislev' } },
] as const;

/** Every day of a month, as the events API takes them: `02-01` … `02-30`. */
export const daysOf = (month: string) => Array.from({ length: 30 }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
