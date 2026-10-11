import type { EntityId } from '@chassidushub/model';

/**
 * An item's place among its siblings (RFC 0002, #78). In a set it sits in
 * beside others, its own key for that set (`orderIn`), else its one
 * `order`; under a sefer or a parent set, only `order`, since those have
 * one parent each.
 */

/** In SQL, for the revision `r`: the key in the set `set` (an SQL expression) when `field` (an SQL expression) is `sets`. */
export const orderSql = (set: string, field: string = "'sets'") =>
  `coalesce(CASE WHEN ${field} = 'sets' THEN r.data->'orderIn'->>${set} END, r.data->>'order', '')`;

/** The same in code, for an item's data: its key in `set` when ordered within a set (`field` sets). */
export function orderOf(data: Record<string, unknown>, set: EntityId | null, field: string): string | undefined {
  if (field === 'sets' && set) {
    const own = (data.orderIn as Record<string, unknown> | undefined)?.[set];
    if (typeof own === 'string') return own;
  }
  return typeof data.order === 'string' ? data.order : undefined;
}

/**
 * Writes an item's key in a set: its own for that set when it sits in several, else its one `order` (and any
 * own key for that set goes, since `order` now says it).
 */
export function setOrderOf(data: Record<string, unknown>, set: EntityId | null, field: string, key: string): void {
  const sets = Array.isArray(data.sets) ? (data.sets as EntityId[]) : [];
  if (field === 'sets' && set && sets.length > 1) {
    data.orderIn = { ...((data.orderIn as Record<string, string> | undefined) ?? {}), [set]: key };
    return;
  }
  data.order = key;
  if (field === 'sets' && set) dropOrderIn(data, (s) => s === set);
}

/** Keys for sets the item is no longer in go (it moved out), and an empty `orderIn` with them. */
export function tidyOrderIn(data: Record<string, unknown>): void {
  const sets = new Set(Array.isArray(data.sets) ? (data.sets as EntityId[]) : []);
  dropOrderIn(data, (s) => !sets.has(s as EntityId));
}

function dropOrderIn(data: Record<string, unknown>, drop: (set: string) => boolean): void {
  const own = data.orderIn as Record<string, string> | undefined;
  if (!own || typeof own !== 'object') return;
  const kept = Object.fromEntries(Object.entries(own).filter(([s]) => !drop(s)));
  if (Object.keys(kept).length) data.orderIn = kept;
  else delete data.orderIn;
}
