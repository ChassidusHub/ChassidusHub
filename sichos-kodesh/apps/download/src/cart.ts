import type { CustomSections, Preset } from './selection';
import { MONTHS, collectionInfo, monthTokens, sectionsParam, yearLabel } from './selection';

/**
 * The cart: whatever goes into one pack - farbrengens of some years and
 * months, library groups, seforim bundles - picked from the shelves in any
 * mix. The pack API takes all of it in one query (its `scope` list and
 * `works`), sizes it with each file once, and builds it as one pack, split
 * into parts by size. One set of settings serves the whole cart.
 */

export type CartItem =
  | {
      kind: 'farbrengens';
      /** The years, oldest first; the same months of each. */
      years: number[];
      /** Month keys (MONTHS); empty for whole years. */
      months: string[];
      /** Added as this year's kvius, which its label says. */
      kvius?: boolean;
    }
  | {
      kind: 'library';
      collection: string;
      /** null: the whole collection. */
      axis: string | null;
      /** The axis's groups picked, with their names for the label. */
      groups: Array<{ slug: string; name: string }>;
    }
  | { kind: 'works'; bundle: string; name: string };

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
  return `w:${item.bundle}`;
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

/** The item's part of the `scope` list: `5736-01,5740-01`, `maamorim:year:5711`; none for a seforim bundle. */
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
  const works = [...new Set(items.flatMap((i) => (i.kind === 'works' ? [i.bundle] : [])))];
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
export function yearsText(years: number[]): string {
  if (years.length <= 3) return years.map(yearLabel).join(', ');
  const contiguous = years.every((y, i) => i === 0 || y === years[i - 1]! + 1);
  if (contiguous) return `${yearLabel(years[0]!)}–${yearLabel(years[years.length - 1]!)}`;
  return `${years.length} שנים`;
}

function namesText(names: string[], many: string): string {
  return names.length <= 3 ? names.join(', ') : `${names.length} ${many}`;
}

/** What the cart shows for an item: a title and the line under it. */
export function itemLabel(item: CartItem): { title: string; detail: string } {
  if (item.kind === 'farbrengens') {
    const months = item.months.map((key) => MONTHS.find((m) => m.key === key)?.name ?? key);
    const what = months.length === 0 ? 'התוועדויות, השנה כולה' : `התוועדויות ${namesText(months, 'חודשים')}`;
    if (item.kvius) return { title: `${what} ${item.years.length === 1 ? 'בשנת הקביעות' : 'בשנות הקביעות'}`, detail: item.years.map(yearLabel).join(' · ') };
    return { title: what, detail: item.years.length === 1 ? yearLabel(item.years[0]!) : `${yearsText(item.years)} (${item.years.length} שנים)` };
  }
  if (item.kind === 'library') {
    const info = collectionInfo(item.collection);
    if (!item.axis || item.groups.length === 0) return { title: info.name, detail: `כל ה${info.many}` };
    return { title: info.name, detail: namesText(item.groups.map((g) => g.name), 'קבוצות') };
  }
  return { title: item.name, detail: 'ספרים: הטקסט המלא והחיפוש' };
}

const STORAGE_KEY = 'sk-pack-cart-v1';

/** The cart kept in this browser (a convenience: an empty cart when storage is blocked). */
export function loadCart(): { items: CartItem[]; settings: Partial<CartSettings> } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { items?: unknown; settings?: unknown }) : null;
    const items = Array.isArray(parsed?.items) ? (parsed!.items as CartItem[]).filter((i) => i && typeof i === 'object' && ['farbrengens', 'library', 'works'].includes((i as CartItem).kind)) : [];
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
