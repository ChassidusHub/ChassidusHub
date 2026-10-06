import type { Lang } from './i18n';
import type { CustomSections, Preset } from './selection';
import { allOf, collectionInfo, groupName, monthName, monthTokens, sectionsParam, yearLabel } from './selection';

/**
 * The cart: whatever goes into one pack - farbrengens of some years and
 * months, library groups, seforim (whole, or some of their parts) - picked
 * from the shelves in any mix. The pack API takes all of it in one query
 * (its `scope` list and `works`), sizes it with each file once, and builds
 * it as one pack, split into parts by size. One set of settings serves the
 * whole cart. Names are kept in both languages, so the cart reads in
 * whichever the site is in.
 */

export interface Names {
  he: string;
  en: string;
}

export type CartItem =
  | {
      kind: 'farbrengens';
      /** The years, oldest first; the same months of each. */
      years: number[];
      /** Month keys (MONTHS); empty for whole years. */
      months: string[];
      /** Added as this year's kvius (all its years or some), which its label says. */
      kvius?: boolean;
    }
  | {
      kind: 'library';
      collection: string;
      /** null: the whole collection. */
      axis: string | null;
      /** The axis's groups picked, with their names for the label. */
      groups: Array<{ slug: string; name: string; nameEn?: string }>;
    }
  | {
      kind: 'works';
      /** What the pack API's `works` takes: sefer ids, bundle ids, or a sefer's parts (`igros-kodesh-rebbe:3`). */
      tokens: string[];
      name: Names;
      /** The parts taken, by name, when not the whole. */
      parts?: Names[];
    };

export interface CartSettings {
  preset: Preset;
  custom: CustomSections;
  profile: string;
  maxMb: number;
}

/** Two items with the same key are the same thing: adding it again replaces it. */
export function itemKey(item: CartItem): string {
  if (item.kind === 'farbrengens') return `f:${item.years.join('.')}:${item.months.join('.')}`;
  if (item.kind === 'library') return `l:${item.collection}:${item.axis ?? ''}:${item.groups.map((g) => g.slug).join('.')}`;
  return `w:${item.tokens.join(',')}`;
}

export function addItem(items: CartItem[], item: CartItem): CartItem[] {
  const key = itemKey(item);
  return [...items.filter((i) => itemKey(i) !== key), item];
}

export function removeItem(items: CartItem[], key: string): CartItem[] {
  return items.filter((i) => itemKey(i) !== key);
}

export function hasItem(items: CartItem[], item: CartItem): boolean {
  const key = itemKey(item);
  return items.some((i) => itemKey(i) === key);
}

/** The item's part of the `scope` list: `5736-01,5740-01`, `maamorim:year:5711`; none for seforim. */
export function itemScopeTokens(item: CartItem): string[] {
  if (item.kind === 'farbrengens') {
    if (item.months.length === 0) return item.years.map(String);
    return item.years.flatMap((year) => item.months.flatMap((key) => monthTokens(year, key)).map((token) => `${year}-${token}`));
  }
  if (item.kind === 'library') {
    if (!item.axis || item.groups.length === 0) return [item.collection];
    return item.groups.map((g) => `${item.collection}:${item.axis}:${g.slug}`);
  }
  return [];
}

/** Whether the item brings recordings, so the cart asks for a quality: farbrengens and maamorim have them. */
export function itemHasAudio(item: CartItem): boolean {
  return item.kind === 'farbrengens' || (item.kind === 'library' && item.collection === 'maamorim');
}

/** The query of a list of items; null when it holds nothing, or farbrengens with no content picked. */
export function cartQuery(items: CartItem[], settings: CartSettings): string | null {
  if (items.length === 0) return null;
  const scope = [...new Set(items.flatMap(itemScopeTokens))];
  const works = [...new Set(items.flatMap((i) => (i.kind === 'works' ? i.tokens : [])))];
  const sections = sectionsParam(settings);
  if (items.some((i) => i.kind === 'farbrengens') && !sections) return null;
  const params = new URLSearchParams();
  if (scope.length > 0) params.set('scope', scope.join(','));
  if (works.length > 0) params.set('works', works.join(','));
  params.set('profile', settings.profile);
  if (sections) params.set('sections', sections);
  params.set('maxMb', String(settings.maxMb));
  return params.toString();
}

/** A few years by name, a run as its first and last, a long list by count. */
export function yearsText(years: number[], lang: Lang = 'he'): string {
  if (years.length <= 3) return years.map((y) => yearLabel(y, lang)).join(', ');
  const contiguous = years.every((y, i) => i === 0 || y === years[i - 1]! + 1);
  if (contiguous) return `${yearLabel(years[0]!, lang)}–${yearLabel(years[years.length - 1]!, lang)}`;
  return lang === 'he' ? `${years.length} שנים` : `${years.length} years`;
}

function namesText(names: string[], many: Names, lang: Lang): string {
  return names.length <= 3 ? names.join(', ') : `${names.length} ${many[lang]}`;
}

const MONTHS_WORD: Names = { he: 'חודשים', en: 'months' };
const GROUPS_WORD: Names = { he: 'קבוצות', en: 'groups' };
const PARTS_WORD: Names = { he: 'חלקים', en: 'parts' };

/** What the cart shows for an item: a title and the line under it. */
export function itemLabel(item: CartItem, lang: Lang = 'he'): { title: string; detail: string } {
  const he = lang === 'he';
  if (item.kind === 'farbrengens') {
    const months = item.months.map((key) => monthName(key, lang));
    const what = months.length === 0 ? (he ? 'התוועדויות, השנה כולה' : 'Farbrengens, whole years') : he ? `התוועדויות ${namesText(months, MONTHS_WORD, lang)}` : `Farbrengens: ${namesText(months, MONTHS_WORD, lang)}`;
    const count = item.years.length;
    if (item.kvius) {
      const title = he ? `${what} ${count === 1 ? 'בשנת הקביעות' : 'בשנות הקביעות'}` : `${what}, ${count === 1 ? 'the kvius year' : 'kvius years'}`;
      return { title, detail: item.years.map((y) => yearLabel(y, lang)).join(' · ') };
    }
    return { title: what, detail: count === 1 ? yearLabel(item.years[0]!, lang) : `${yearsText(item.years, lang)} (${he ? `${count} שנים` : `${count} years`})` };
  }
  if (item.kind === 'library') {
    const info = collectionInfo(item.collection, lang);
    if (!item.axis || item.groups.length === 0) return { title: info.name, detail: allOf(info, lang) };
    return { title: info.name, detail: namesText(item.groups.map((g) => groupName(item.collection, item.axis!, g, lang)), GROUPS_WORD, lang) };
  }
  if (item.parts && item.parts.length > 0) return { title: item.name[lang], detail: namesText(item.parts.map((p) => p[lang]), PARTS_WORD, lang) };
  return { title: item.name[lang], detail: he ? 'ספרים: הטקסט המלא והחיפוש' : 'Seforim: the full text and search' };
}

const STORAGE_KEY = 'chassidushub-pack-cart-v1';

/** An item as an older site kept it (a seforim bundle by one id and a Hebrew name), in today's shape; null for what is not an item. */
export function upgradeItem(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (item.kind === 'farbrengens' && Array.isArray(item.years) && Array.isArray(item.months)) return item as unknown as CartItem;
  if (item.kind === 'library' && typeof item.collection === 'string' && Array.isArray(item.groups)) return item as unknown as CartItem;
  if (item.kind === 'works') {
    if (Array.isArray(item.tokens) && item.name && typeof item.name === 'object') return item as unknown as CartItem;
    if (typeof item.bundle === 'string') {
      const name = typeof item.name === 'string' ? item.name : item.bundle;
      return { kind: 'works', tokens: [item.bundle], name: { he: name, en: name } };
    }
  }
  return null;
}

/** The cart kept in this browser (a convenience: an empty cart when storage is blocked). */
export function loadCart(): { items: CartItem[]; settings: Partial<CartSettings> } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { items?: unknown; settings?: unknown }) : null;
    const items = Array.isArray(parsed?.items) ? parsed!.items.map(upgradeItem).filter((i): i is CartItem => i !== null) : [];
    const settings = parsed?.settings && typeof parsed.settings === 'object' ? (parsed.settings as Partial<CartSettings>) : {};
    return { items, settings };
  } catch {
    return { items: [], settings: {} };
  }
}

export function saveCart(items: CartItem[], settings: CartSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, settings }));
  } catch {
    // Storage blocked: the cart lasts as long as the page.
  }
}
