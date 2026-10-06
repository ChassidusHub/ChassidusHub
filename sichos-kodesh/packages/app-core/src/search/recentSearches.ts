/**
 * The searches a listener made lately, most recent first (the redo plan's
 * "חיפוש": before typing, recent searches). Pure: each app keeps the list
 * in its own storage.
 */

/** How many are kept. */
export const RECENT_SEARCHES_MAX = 8;

/** The list with `query` first: trimmed, once only (the same words in any case count as one), and at most `max` long. Too short to be a search, it changes nothing. */
export function rememberSearch(recent: readonly string[], query: string, max = RECENT_SEARCHES_MAX): string[] {
  const text = query.trim().replace(/\s+/g, ' ');
  if (text.length < 2) return [...recent];
  const key = text.toLocaleLowerCase();
  return [text, ...recent.filter((item) => item.toLocaleLowerCase() !== key)].slice(0, max);
}

/** A stored list read back: strings only, however it was stored. */
export function parseRecentSearches(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, RECENT_SEARCHES_MAX) : [];
}
