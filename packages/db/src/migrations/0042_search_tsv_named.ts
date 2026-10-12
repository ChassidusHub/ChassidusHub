/**
 * The search words of the items search finds by name (sets, sefarim, events,
 * recordings, books, authors) in an index of their own (`entity_tsv_named`),
 * for search's names (searchPage.ts, namedInfo; issue #214).
 *
 * Names were found in the one index over every item's words
 * (entity_search_tsv, 0024), and then the kinds kept. For a common word that
 * index's lists run through every page, paragraph and sicha that holds it, so
 * a first search read thousands of its pages from disk only to drop them: on
 * live, 1.2-4.3 s of a cold search after 0039-0041 (QA, 2026-10-12). This
 * index holds only the named kinds, a few tens of thousands of items: locally
 * 1.8 MB against 68 MB, and a common word's names read 34 buffers, not 539.
 * The reads change nothing: the planner finds it by itself, its kinds being
 * the ones namedInfo asks for.
 *
 * Built CONCURRENTLY, outside a transaction (Migration.outside), so the
 * catalog takes Approves while it builds. A deploy that stops halfway runs
 * it again from the start: an index a stopped build left invalid is dropped
 * first.
 */
export const outside = true;

export const up = /* sql */ `
DROP INDEX CONCURRENTLY IF EXISTS entity_tsv_named;
CREATE INDEX CONCURRENTLY entity_tsv_named ON entity USING gin (search_tsv) WHERE type IN ('set', 'work', 'event', 'recording', 'publication', 'author') AND NOT deleted AND main_rev IS NOT NULL;
`;
