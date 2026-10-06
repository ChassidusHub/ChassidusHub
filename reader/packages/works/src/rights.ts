import { isShippable } from '@chassidushub-reader/catalog';
import type { Licence, RightsDecision, SourceId } from './types.js';

/**
 * The rights gate, per edition (docs/chabad-library-plan.md, section 5):
 * what a copy's licence allows, then any decision taken for its source.
 * It replaces the per-collection table of packages/catalog/src/rights.ts
 * for the works; the two agree on the collections that table knows (a test
 * holds them together).
 */

const BY_LICENCE: Record<Licence, RightsDecision> = {
  'facts-and-links': 'ship',
  'public-domain': 'ship',
  cc0: 'ship',
  'cc-by': 'ship-with-credit',
  'cc-by-nc': 'ship-with-credit',
  // Free to read on the site, which alone does not license copies in packs.
  'free-to-read': 'link-only',
  'site-terms': 'link-only',
  commercial: 'local-only',
  unknown: 'link-only',
};

/**
 * Decisions taken per source, over what its licence alone allows. Each is a
 * decision for Shmuly (the plan's section 6), and flipping one is that
 * decision, nothing else:
 * - chabadlibrary.org (decision 1): read and link now; offline once the
 *   library agrees.
 * - HebrewBooks (decision 2): links and thumbnails until it permits copies.
 * - the Igros app's data files: decided per collection, by
 *   packages/catalog's SHIPPABLE_COLLECTIONS (see `igrosAppDecision`).
 */
export const SOURCE_DECISIONS: Partial<Record<SourceId, RightsDecision>> = {
  chabadlibrary: 'link-only',
  hebrewbooks: 'link-only',
};

/**
 * The Igros app's copies ship as their collection does - the part of the
 * copy's id before any `:` (`igros`, `maanos:5742:4`) - in packages/catalog's
 * table: the Igros Kodesh (cleared 2026-09-24) with a credit, the Maanos
 * nowhere. A copy with no id, or of a collection the table does not clear,
 * stays local.
 */
function igrosAppDecision(sourceId: string | undefined): RightsDecision {
  const collection = sourceId?.split(':')[0];
  return collection && isShippable(collection) ? 'ship-with-credit' : 'local-only';
}

const ORDER: RightsDecision[] = ['ship', 'ship-with-credit', 'link-only', 'local-only'];
const stricter = (a: RightsDecision, b: RightsDecision): RightsDecision => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/** What may be done with one copy: the stricter of its licence and its source's decision; the Igros app's copies by their collection. */
export function rightsFor(copy: { source: SourceId; sourceId?: string; licence: Licence }): RightsDecision {
  if (copy.source === 'igros-app') return igrosAppDecision(copy.sourceId);
  const byLicence = BY_LICENCE[copy.licence];
  const bySource = SOURCE_DECISIONS[copy.source];
  return bySource ? stricter(byLicence, bySource) : byLicence;
}

/** Whether a copy may go into a pack or a catalog release. */
export function mayShip(copy: { source: SourceId; sourceId?: string; licence: Licence }): boolean {
  const decision = rightsFor(copy);
  return decision === 'ship' || decision === 'ship-with-credit';
}
