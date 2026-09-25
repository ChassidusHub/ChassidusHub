import { gematriya } from '@hebcal/core';
import { mafteiachMonthNameHebrew, mafteiachMonthToken } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';

/**
 * The site's choices, as the pack API takes them (pack-format's parseScope
 * and parseSections): a scope (`5736`, `5736-01`), a sections list, an
 * audio profile and a part size. Pure, so it is tested without a browser.
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

export interface Choice {
  year: number;
  /** A mafteiach month token, or null for the whole year. */
  month: string | null;
  preset: Preset;
  custom: CustomSections;
  profile: string;
  maxMb: number;
}

export const DEFAULT_CUSTOM: CustomSections = { audio: true, sichosKodesh: true, torasMenachem: false, mugah: true, maamorim: false, hagahos: false, hosofos: false };

export function sectionsParam(choice: Pick<Choice, 'preset' | 'custom'>): string | null {
  if (choice.preset !== 'custom') return choice.preset;
  const c = choice.custom;
  const parts: string[] = [];
  if (c.audio) parts.push('audio');
  const editions = [c.sichosKodesh ? 'sichosKodesh' : null, c.torasMenachem ? 'torasMenachem' : null].filter(Boolean);
  if (editions.length > 0) parts.push(`biltiMugah:${editions.join('+')}`);
  for (const flag of ['mugah', 'maamorim', 'hagahos', 'hosofos'] as const) if (c[flag]) parts.push(flag);
  return parts.length > 0 ? parts.join(',') : null;
}

export function scopeParam(choice: Pick<Choice, 'year' | 'month'>): string {
  return choice.month ? `${choice.year}-${choice.month}` : String(choice.year);
}

/** The query every size and build request carries; null while the choice selects nothing. */
export function selectionQuery(choice: Choice): string | null {
  const sections = sectionsParam(choice);
  if (!sections) return null;
  const params = new URLSearchParams({ scope: scopeParam(choice), profile: choice.profile, sections, maxMb: String(choice.maxMb) });
  return params.toString();
}

export interface MonthOption {
  token: string;
  name: string;
  occasions: number;
}

/** The months of a year that have farbrengens, in the year's order (Tishrei first). */
export function monthsOf(entries: CatalogEntry[]): MonthOption[] {
  const counts = new Map<string, { name: string; occasions: number }>();
  for (const entry of entries) {
    const token = mafteiachMonthToken(entry.hebrewDate);
    const current = counts.get(token);
    if (current) current.occasions += 1;
    else counts.set(token, { name: mafteiachMonthNameHebrew(entry.hebrewDate), occasions: 1 });
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([token, value]) => ({ token, ...value }));
}

export function yearLabel(year: number): string {
  return gematriya(year);
}

/** Each audio quality as the site offers it: its name, what it is for, and whether it is the one to take. */
export interface ProfileInfo {
  name: string;
  note: string;
  recommended?: boolean;
}

// Sizes as measured on the archive's recordings (opus16 came to 49% of the originals, opus24 to 74%).
export const PROFILE_INFO: Record<string, ProfileInfo> = {
  opus16: { name: 'קובץ מוקטן', note: 'נשמע אותו דבר, בחצי מהגודל', recommended: true },
  opus24: { name: 'קובץ מוקטן', note: 'נשמע אותו דבר, בשלושה רבעים מהגודל' },
  opus32: { name: 'קובץ מוקטן', note: 'נשמע אותו דבר, קצת קטן מהמקור' },
  src: { name: 'הקובץ המקורי', note: 'ה-MP3 כמו שהוקלט, בגודל המלא' },
  'mp3-32': { name: 'MP3 מוקטן', note: 'לנגני MP3 פשוטים' },
};

export function profileInfo(profile: string): ProfileInfo {
  return PROFILE_INFO[profile] ?? { name: profile, note: '' };
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
  /** How one item and many are counted: "שיחה אחת", "12 שיחות". */
  one: string;
  many: string;
}

export const COLLECTIONS: CollectionInfo[] = [
  { id: 'farbrengens', name: 'התוועדויות', one: 'התוועדות אחת', many: 'התוועדויות' },
  { id: 'likkuteiSichos', name: 'לקוטי שיחות', one: 'שיחה אחת', many: 'שיחות' },
  { id: 'maamorim', name: 'מאמרים', one: 'מאמר אחד', many: 'מאמרים' },
  { id: 'yomanim', name: 'יומנים', one: 'יומן אחד', many: 'יומנים' },
  { id: 'michtavimKlolim', name: 'מכתבים כלליים', one: 'מכתב אחד', many: 'מכתבים' },
  { id: 'hadranim', name: 'הדרנים', one: 'הדרן אחד', many: 'הדרנים' },
  { id: 'reshimos', name: 'רשימות', one: 'רשימה אחת', many: 'רשימות' },
];

export function collectionInfo(id: string): CollectionInfo {
  return COLLECTIONS.find((c) => c.id === id) ?? { id, name: id, one: 'פריט אחד', many: 'פריטים' };
}

/** The browse axes the app offers, as the site names them, in the order to offer them. */
export const AXES: Array<{ id: string; name: string }> = [
  { id: 'volume', name: 'לפי חלק' },
  { id: 'year', name: 'לפי שנה' },
  { id: 'melukat', name: 'מלוקט' },
  { id: 'melukatByMonths', name: 'מלוקט, מהדורה חדשה' },
  { id: 'masechta', name: 'לפי מסכת' },
  { id: 'moed', name: 'לפי מועד' },
  { id: 'moad', name: 'לפי מועד' },
  { id: 'parsha', name: 'לפי פרשה' },
  { id: 'month', name: 'לפי חודש' },
  { id: 'supplement', name: 'מילואים' },
];

/** A collection's axes that the site knows, in AXES order. */
export function axesOf(groups: Record<string, unknown>): Array<{ id: string; name: string }> {
  return AXES.filter((axis) => Array.isArray(groups[axis.id]) && (groups[axis.id] as unknown[]).length > 0);
}

export interface LibraryChoice {
  collection: string;
  /** null: the whole collection. */
  axis: string | null;
  group: string | null;
  profile: string;
  maxMb: number;
}

/** `maamorim`, or `maamorim:year:5711`: pack-format's library scope. */
export function libraryScopeParam(choice: Pick<LibraryChoice, 'collection' | 'axis' | 'group'>): string {
  return choice.axis && choice.group ? `${choice.collection}:${choice.axis}:${choice.group}` : choice.collection;
}

/** The size and build query of a library choice; null until a group of the chosen axis is picked. */
export function libraryQuery(choice: LibraryChoice): string | null {
  if (choice.axis && !choice.group) return null;
  return new URLSearchParams({ scope: libraryScopeParam(choice), profile: choice.profile, maxMb: String(choice.maxMb) }).toString();
}
