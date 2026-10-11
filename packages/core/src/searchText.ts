import { describeDateKey, normalizeSearchText, parseDateKey } from '@chassidushub/hebrew';

const TEXT_FIELDS = new Set(['he', 'en', 'yi', 'aliases', 'content', 'body', 'text', 'occasion', 'families', 'publisher', 'volume', 'placePrinted', 'label', 'slug']);
const DATE_FIELDS = new Set(['date', 'dateEnd', 'born', 'passed']);

/**
 * What the built-in search finds an item by: its names in every language,
 * aliases, labels, text, and its dates both as keys and as people write
 * them (`י׳ שבט תשמ״ב`, `10 Shevat 5742`) - all normalised the way queries
 * are, so niqqud, gershayim and case never stand in the way.
 */
export function searchTextOf(data: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown, key: string): void => {
    if (typeof value === 'string') {
      if (DATE_FIELDS.has(key) && parseDateKey(value)) parts.push(value, describeDateKey(value, 'he'), describeDateKey(value, 'en'));
      else if (TEXT_FIELDS.has(key)) parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(data, '');
  return normalizeSearchText(parts.join(' ')).slice(0, 200_000);
}

/** A query as Postgres full text search takes it: every word, each as a prefix. Null when nothing is left to search for. */
export function toTsQuery(query: string): string | null {
  const words = normalizeSearchText(query)
    .split(' ')
    .filter((w) => w.length > 0)
    .slice(0, 12);
  return words.length > 0 ? words.map((w) => `${w}:*`).join(' & ') : null;
}

/**
 * A name as the search compares it, in SQL: what normalizeSearchText does
 * (niqqud, gershayim and quotes dropped, lower case, whatever is not a
 * letter or a digit a space), so `תניא` is the title `תַּנְיָא`.
 */
export const normalizedSql = (expr: string) =>
  `btrim(regexp_replace(lower(regexp_replace(coalesce(${expr}, ''), '[֑-ׇ׳״"''\`‘’“”]', '', 'g')), '[^0-9a-zÀ-ɏא-תװ-ײ]+', ' ', 'g'))`;

/** The names a sefer or a set is found by first: its title or name, in Hebrew and in English. */
export const NAMES = ["r.data->'title'->>'he'", "r.data->'title'->>'en'", "r.data->'name'->>'he'", "r.data->'name'->>'en'"];

/**
 * The first keys of the search's order, in SQL (lower first), given the
 * query normalized as `query` and as a tsquery as `tsQuery` (both SQL
 * parameters). The catalog's tree is built of official sefarim and sets,
 * so the one whose name is the query comes first, then those whose name
 * starts with it, then those whose name holds every word of it; within
 * each, an official sefer before an addition to one (WorkData.addition).
 * Everything else follows, by how well its words match. Without this a
 * sefer's own title was crowded out by the sichos that mention it.
 * `typed`, when given, is a second form of the query a name may be: the
 * words as typed, small words and all ("Letters from the Rebbe").
 */
export function searchTierSql(query: string, tsQuery: string, typed: string = query): string {
  return `CASE WHEN e.type NOT IN ('work', 'set') THEN 3 ELSE ${nameTierSql(NAMES.map(normalizedSql), query, tsQuery, typed)} END, (e.type = 'work' AND r.data ? 'addition')`;
}

/**
 * How well names match the query, in SQL: 0 when one is the query, 1 when
 * one starts with it, 2 when one holds every word of it, else 3. `normal`
 * are the names already normalized (normalizedSql), as SQL expressions: a
 * sefer's title and a sicha's own name (unit_place.label) alike.
 */
export function nameTierSql(normal: readonly string[], query: string, tsQuery: string, typed: string = query): string {
  const forms = typed === query ? [query] : [query, typed];
  const exact = normal.flatMap((n) => forms.map((q) => `${n} = ${q}`)).join(' OR ');
  const prefix = normal.flatMap((n) => forms.map((q) => `${n} LIKE ${q} || '%'`)).join(' OR ');
  const words = normal.map((n) => `to_tsvector('simple', ${n}) @@ to_tsquery('simple', ${tsQuery})`).join(' OR ');
  return `CASE WHEN ${exact} THEN 0 WHEN ${prefix} THEN 1 WHEN ${words} THEN 2 ELSE 3 END`;
}
