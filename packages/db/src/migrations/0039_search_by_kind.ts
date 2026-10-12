/**
 * The search words of pages, paragraphs and sichos, each kind in an index of
 * its own (`entity_tsv_page`, `entity_tsv_segment`, `entity_tsv_unit`), for
 * search's moments (moments.ts, searchMoments; issue #214).
 *
 * Moments look for the words in each kind apart: up to 300 scan pages, 1,000
 * paragraphs and 20 sichos. The one index over every item's words
 * (entity_search_tsv, 0024) says how many items hold a word, not how many of
 * that kind do. So for a word in many farbrengens' and recordings' names but
 * few pages, the planner expects to meet pages that hold it at once and reads
 * the pages in turn instead, through all of them; for sichos it reads every
 * sicha's words, which are their whole text. Locally, a word in 3,700 names
 * and no page read 152,746 buffers (332 ms warm) for the moments alone. With
 * each kind's own index it reads 29 (0.5 ms); a common word and a rare word
 * read the same or less, under custom and generic plans alike.
 *
 * Each index holds only that kind's live rows, the rows the moments ask for.
 * The reads change nothing: the planner finds these by itself. Building them
 * holds entity against writes, not reads, while it lasts; lock_timeout makes
 * it give up rather than keep an Approve waiting, and migrate tries again.
 */
export const up = /* sql */ `
SET LOCAL lock_timeout = '3s';
CREATE INDEX entity_tsv_page ON entity USING gin (search_tsv) WHERE type = 'text-page' AND NOT deleted AND main_rev IS NOT NULL;
CREATE INDEX entity_tsv_segment ON entity USING gin (search_tsv) WHERE type = 'segment' AND NOT deleted AND main_rev IS NOT NULL;
CREATE INDEX entity_tsv_unit ON entity USING gin (search_tsv) WHERE type = 'unit' AND NOT deleted AND main_rev IS NOT NULL;
`;
