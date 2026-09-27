import { HDate, gematriya } from '@hebcal/core';
import { mafteiachMonthToken } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { Lang } from './i18n';

/**
 * The site's vocabulary, as the pack API takes it (pack-format's parseScope
 * and parseSections): the months, the content presets, the audio
 * qualities, the library's collections and axes. The cart (cart.ts) puts
 * them together. Pure, so it is tested without a browser.
 */

export type Preset = 'essentials' | 'everything' | 'custom';

export interface CustomSections {
  audio: boolean;
  sichosKodesh: boolean;
  torasMenachem: boolean;
  mugah: boolean;
  maamorim: boolean;
  hagahos: boolean;
  hosofos: boolean;
}

/** The months as the site offers them, Tishrei first. Adar is one choice: Adar in a plain year, Adar I and II in a leap year. */
export const MONTHS: Array<{ key: string; name: string; nameEn: string }> = [
  { key: '01', name: 'תשרי', nameEn: 'Tishrei' },
  { key: '02', name: 'חשוון', nameEn: 'Cheshvan' },
  { key: '03', name: 'כסלו', nameEn: 'Kislev' },
  { key: '04', name: 'טבת', nameEn: 'Teves' },
  { key: '05', name: 'שבט', nameEn: 'Shevat' },
  { key: '06', name: 'אדר', nameEn: 'Adar' },
  { key: '07', name: 'ניסן', nameEn: 'Nissan' },
  { key: '08', name: 'אייר', nameEn: 'Iyar' },
  { key: '09', name: 'סיוון', nameEn: 'Sivan' },
  { key: '10', name: 'תמוז', nameEn: 'Tammuz' },
  { key: '11', name: 'אב', nameEn: 'Menachem Av' },
  { key: '12', name: 'אלול', nameEn: 'Elul' },
];

/** A month key's name in a language. */
export function monthName(key: string, lang: Lang = 'he'): string {
  const month = MONTHS.find((m) => m.key === key);
  return month ? (lang === 'he' ? month.name : month.nameEn) : key;
}

/** A month key's mafteiach tokens in a year: Adar is 06A and 06B in a leap year. */
export function monthTokens(year: number, key: string): string[] {
  if (key !== '06') return [key];
  return HDate.isLeapYear(year) ? ['06A', '06B'] : ['06'];
}

export const DEFAULT_CUSTOM: CustomSections = { audio: true, sichosKodesh: true, torasMenachem: false, mugah: true, maamorim: false, hagahos: false, hosofos: false };

export function sectionsParam(choice: { preset: Preset; custom: CustomSections }): string | null {
  if (choice.preset !== 'custom') return choice.preset;
  const c = choice.custom;
  const parts: string[] = [];
  if (c.audio) parts.push('audio');
  const editions = [c.sichosKodesh ? 'sichosKodesh' : null, c.torasMenachem ? 'torasMenachem' : null].filter(Boolean);
  if (editions.length > 0) parts.push(`biltiMugah:${editions.join('+')}`);
  for (const flag of ['mugah', 'maamorim', 'hagahos', 'hosofos'] as const) if (c[flag]) parts.push(flag);
  return parts.length > 0 ? parts.join(',') : null;
}

export interface MonthOption {
  token: string;
  name: string;
  occasions: number;
}

/** The months of a year that have farbrengens (Adar I and II together, as MONTHS has them), Tishrei first, with how many each has. */
export function monthsOf(entries: CatalogEntry[], lang: Lang = 'he'): MonthOption[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = mafteiachMonthToken(entry.hebrewDate).slice(0, 2);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return MONTHS.filter((m) => counts.has(m.key)).map((m) => ({ token: m.key, name: monthName(m.key, lang), occasions: counts.get(m.key)! }));
}

/** A Hebrew year as a reader of the language writes it: תשל״ו, or 5736. */
export function yearLabel(year: number, lang: Lang = 'he'): string {
  return lang === 'he' ? gematriya(year) : String(year);
}

/** Each audio quality as the site offers it: its name, what it is for, and whether it is the one to take. */
export interface ProfileInfo {
  name: string;
  note: string;
  recommended?: boolean;
}

// Sizes as measured on the archive's recordings (opus16 came to 49% of the originals, opus24 to 74%).
const PROFILE_INFO: Record<string, Record<Lang, ProfileInfo>> = {
  opus16: { he: { name: 'קובץ מוקטן', note: 'נשמע אותו דבר, בחצי מהגודל', recommended: true }, en: { name: 'Reduced file', note: 'Sounds the same, at half the size', recommended: true } },
  opus24: { he: { name: 'קובץ מוקטן', note: 'נשמע אותו דבר, בשלושה רבעים מהגודל' }, en: { name: 'Reduced file', note: 'Sounds the same, at three quarters of the size' } },
  opus32: { he: { name: 'קובץ מוקטן', note: 'נשמע אותו דבר, קצת קטן מהמקור' }, en: { name: 'Reduced file', note: 'Sounds the same, a little smaller than the original' } },
  src: { he: { name: 'הקובץ המקורי', note: 'ההקלטה כמו שהיא, בגודל המלא' }, en: { name: 'The original file', note: 'The recording as it is, at full size' } },
  'mp3-32': { he: { name: 'MP3 מוקטן', note: 'לנגני MP3 פשוטים' }, en: { name: 'Reduced MP3', note: 'For simple MP3 players' } },
};

export function profileInfo(profile: string, lang: Lang = 'he'): ProfileInfo {
  return PROFILE_INFO[profile]?.[lang] ?? { name: profile, note: '' };
}

/** The qualities in the order to offer them: the recommended first, the originals last. */
export function orderProfiles(profiles: string[]): string[] {
  const order = ['opus16', 'opus24', 'opus32', 'mp3-32', 'src'];
  return [...profiles].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}

/** A left-to-right run (a size, a file name) inside Hebrew text: isolated so "81.2 MB" never shows as "MB 81.2", and kept on one line. */
export function ltr(text: string): string {
  return `\u2066${text.replace(/ /g, '\u00a0')}\u2069`;
}

export function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** What a pack can hold: the farbrengens, or one of the library's collections (pack-format's library.ts). */
export interface CollectionInfo {
  id: string;
  name: string;
  /** How one item and many are counted: "שיחה אחת", "12 שיחות"; "1 sicha", "12 sichos". */
  one: string;
  many: string;
}

const COLLECTION_NAMES: Array<{ id: string; he: Omit<CollectionInfo, 'id'>; en: Omit<CollectionInfo, 'id'> }> = [
  { id: 'farbrengens', he: { name: 'התוועדויות', one: 'התוועדות אחת', many: 'התוועדויות' }, en: { name: 'Farbrengens', one: 'farbrengen', many: 'farbrengens' } },
  { id: 'likkuteiSichos', he: { name: 'לקוטי שיחות', one: 'שיחה אחת', many: 'שיחות' }, en: { name: 'Likkutei Sichos', one: 'sicha', many: 'sichos' } },
  { id: 'maamorim', he: { name: 'מאמרים', one: 'מאמר אחד', many: 'מאמרים' }, en: { name: 'Maamorim', one: 'maamar', many: 'maamorim' } },
  { id: 'yomanim', he: { name: 'יומנים', one: 'יומן אחד', many: 'יומנים' }, en: { name: 'Yomanim', one: 'yoman', many: 'yomanim' } },
  { id: 'michtavimKlolim', he: { name: 'מכתבים כלליים', one: 'מכתב אחד', many: 'מכתבים' }, en: { name: 'General letters', one: 'letter', many: 'letters' } },
  { id: 'hadranim', he: { name: 'הדרנים', one: 'הדרן אחד', many: 'הדרנים' }, en: { name: 'Hadranim', one: 'hadran', many: 'hadranim' } },
  { id: 'reshimos', he: { name: 'רשימות', one: 'רשימה אחת', many: 'רשימות' }, en: { name: 'Reshimos', one: 'reshimah', many: 'reshimos' } },
];

/** The collections in the order the site offers them. */
export const COLLECTION_IDS = COLLECTION_NAMES.map((c) => c.id);

export function collectionInfo(id: string, lang: Lang = 'he'): CollectionInfo {
  const found = COLLECTION_NAMES.find((c) => c.id === id);
  if (found) return { id, ...found[lang] };
  return lang === 'he' ? { id, name: id, one: 'פריט אחד', many: 'פריטים' } : { id, name: id, one: 'item', many: 'items' };
}

/** "שיחה אחת" / "12 שיחות"; "1 sicha" / "12 sichos". */
export function countItems(info: CollectionInfo, n: number, lang: Lang): string {
  if (lang === 'he') return n === 1 ? info.one : `${n.toLocaleString('he-IL')} ${info.many}`;
  return `${n.toLocaleString('en-US')} ${n === 1 ? info.one : info.many}`;
}

/** "כל השיחות" / "All the sichos". */
export function allOf(info: CollectionInfo, lang: Lang): string {
  return lang === 'he' ? `כל ה${info.many}` : `All the ${info.many}`;
}

/** The browse axes the app offers, as the site names them, in the order to offer them. */
const AXES: Array<{ id: string; he: string; en: string }> = [
  { id: 'volume', he: 'לפי חלק', en: 'By volume' },
  { id: 'year', he: 'לפי שנה', en: 'By year' },
  { id: 'melukat', he: 'מלוקט', en: 'Melukat' },
  { id: 'melukatByMonths', he: 'מלוקט, מהדורה חדשה', en: 'Melukat, new edition' },
  { id: 'masechta', he: 'לפי מסכת', en: 'By masechta' },
  { id: 'moed', he: 'לפי מועד', en: 'By moed' },
  { id: 'moad', he: 'לפי מועד', en: 'By moed' },
  { id: 'parsha', he: 'לפי פרשה', en: 'By parsha' },
  { id: 'month', he: 'לפי חודש', en: 'By month' },
  { id: 'supplement', he: 'מילואים', en: 'Supplement' },
];

/** A collection's axes that the site knows, in AXES order. */
export function axesOf(groups: Record<string, unknown>, lang: Lang = 'he'): Array<{ id: string; name: string }> {
  return AXES.filter((axis) => Array.isArray(groups[axis.id]) && (groups[axis.id] as unknown[]).length > 0).map((axis) => ({ id: axis.id, name: axis[lang] }));
}

/** A library group's name as the app shows it: a year by the language's numbers, a Likkutei Sichos volume and a Melukat volume by their word. */
export function groupName(collection: string, axis: string, group: { slug: string; name: string; nameEn?: string }, lang: Lang): string {
  const number = Number(group.slug);
  if (axis === 'year' && Number.isInteger(number) && number > 5000) return yearLabel(number, lang);
  if (axis === 'volume' && collection === 'likkuteiSichos' && Number.isInteger(number) && group.slug !== '40') return lang === 'he' ? `חלק ${group.name}` : `Volume ${number}`;
  if (axis === 'melukat' && Number.isInteger(number)) return lang === 'he' ? `מלוקט ח״${group.name}` : `Melukat, volume ${number}`;
  return lang === 'en' ? (group.nameEn ?? group.name) : group.name;
}
