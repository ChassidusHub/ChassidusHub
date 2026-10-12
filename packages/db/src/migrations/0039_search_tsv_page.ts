/**
 * The search words of the pages of scans (300 at most per search), in an index of their own
 * (`entity_tsv_page`), for search's moments (moments.ts, searchMoments;
 * issue #214). One of three, one kind each: 0039 pages, 0040 paragraphs,
 * and the sichos' own in its own deploy after these.
 *
 * Moments look for the words in each kind apart. The one index over every
 * item's words (entity_search_tsv, 0024) says how many items hold a word, not
 * how many of this kind do; for a word in many farbrengens' and recordings'
 * names but few of these, the planner expected to meet one at once and read
 * them all in turn instead. Locally, with the three indexes, such a word's
 * moments read 29 buffers, not 152,746 (332 ms warm); a common word and a
 * rare one read the same or less. The reads change nothing: the planner finds
 * the index by itself.
 *
 * Built CONCURRENTLY, outside a transaction (Migration.outside), so the
 * catalog takes Approves while it builds. A deploy that stops halfway runs
 * it again from the start: an index a stopped build left invalid is dropped
 * first.
 */
export const outside = true;

export const up = /* sql */ `
DROP INDEX CONCURRENTLY IF EXISTS entity_tsv_page;
CREATE INDEX CONCURRENTLY entity_tsv_page ON entity USING gin (search_tsv) WHERE type = 'text-page' AND NOT deleted AND main_rev IS NOT NULL;
`;
