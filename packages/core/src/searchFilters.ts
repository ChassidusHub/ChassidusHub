import type { EntityId, Language } from '@chassidushub/model';
import { languageTitleWords, languageSql } from './language.js';
import { NAME_SQL } from './searchText.js';

/**
 * What a search can be narrowed to, as the site's filter chips ask (#72).
 * The filters combine: a search for an author's sichos in English gives
 * only what is both. An item counts when it says so itself or when its
 * sefer does (a sicha of a sefer the author wrote, a printing of a sefer in
 * the set); a set counts with the sets under it, a topic with the narrower
 * topics under it.
 */
export interface SearchFilters {
  /** One sefer: the sefer's own items (its sichos, its printings). */
  work?: EntityId;
  /** One author: the sefarim he wrote and their items. */
  author?: EntityId;
  /** One set (a series, a shelf), with the sets under it. */
  set?: EntityId;
  /** One topic, with the narrower topics under it. */
  topic?: EntityId;
  /** Only what is in this language (Hebrew: also whatever says no language at all); a sicha or a paragraph by its sefer's or text's. */
  language?: Language;
}

/** The kinds whose language is their sefer's, text's or layer's: their own revisions hold their words. */
const CONTAINED = ['unit', 'segment', 'text-page'].map((t) => `'${t}'`).join(', ');

/** What the item itself, or its sefer, points at in `field`: one of `ids` (an SQL array). */
const ownOrSefer = (field: string, ids: string) =>
  `(EXISTS (SELECT 1 FROM entity_ref x WHERE x.from_id = e.id AND x.field = '${field}' AND x.to_id = ANY (${ids}))
    OR EXISTS (SELECT 1 FROM entity_ref w JOIN entity_ref x ON x.from_id = w.to_id
               WHERE w.from_id = e.id AND w.field = 'work' AND x.field = '${field}' AND x.to_id = ANY (${ids})))`;

/** The item `id` (an SQL parameter) and everything under it through `field` (a set's `parent`, a topic's `broader`), as an SQL array: read once, not per row. */
const withUnder = (id: string, field: string) =>
  `ARRAY (WITH RECURSIVE t (id) AS (SELECT ${id}::text UNION SELECT u.from_id FROM entity_ref u JOIN t ON u.to_id = t.id WHERE u.field = '${field}') SELECT id FROM t)`;

/** The filters as conditions on the item `e`, their values pushed onto `params`. */
export function searchFilterSql(filters: SearchFilters, params: unknown[]): string[] {
  const where: string[] = [];
  const param = (value: unknown) => `$${params.push(value)}`;
  // One sefer's items alone: its many printings share its name, so a search over the whole catalog fills its limit before it reaches them all.
  if (filters.work) where.push(`EXISTS (SELECT 1 FROM entity_ref w WHERE w.from_id = e.id AND w.field = 'work' AND w.to_id = ${param(filters.work)})`);
  if (filters.author) where.push(ownOrSefer('authors', `ARRAY [${param(filters.author)}::text]`));
  if (filters.set) where.push(ownOrSefer('sets', withUnder(param(filters.set), 'parent')));
  if (filters.topic) where.push(ownOrSefer('topics', withUnder(param(filters.topic), 'broader')));
  if (filters.language) {
    const language = param(filters.language);
    const titleWords = param(languageTitleWords(filters.language));
    // A sicha, a paragraph or a page of words is in its sefer's, text's or layer's language: read that small revision, not
    // its own words (a common word in thousands of sichos read each one's whole text, ten seconds, to find none in English).
    const said = `(CASE WHEN e.type IN (${CONTAINED}) THEN (SELECT p.main_rev FROM entity_ref w JOIN entity p ON p.id = w.to_id
                     WHERE w.from_id = e.id AND w.field IN ('work', 'text', 'layer') LIMIT 1) ELSE e.main_rev END)`;
    where.push(`EXISTS (SELECT 1 FROM revision r WHERE r.id = ${said} AND ${languageSql(`${language}::text`, titleWords, NAME_SQL)})`);
  }
  return where;
}
