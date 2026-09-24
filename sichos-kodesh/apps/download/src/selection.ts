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

export const PROFILE_LABELS: Record<string, string> = {
  src: 'מקור (MP3, האיכות המלאה)',
  opus32: 'Opus 32 (חוסך כרבע, לאפליקציה מגרסה 1.8.0)',
  opus24: 'Opus 24 (חוסך כשליש, לאפליקציה מגרסה 1.8.0)',
  opus16: 'Opus 16 (מומלץ: הקטן ביותר, לאפליקציה מגרסה 1.8.0)',
  'mp3-32': 'MP3 32 (לנגנים פשוטים)',
};

/** A left-to-right run (a size, a file name) inside Hebrew text: isolated so "81.2 MB" never shows as "MB 81.2". */
export function ltr(text: string): string {
  return `\u2066${text}\u2069`;
}

export function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
