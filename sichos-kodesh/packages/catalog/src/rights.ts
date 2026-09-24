/**
 * Which collections may leave the machine they were built on: be bundled
 * in an app, published in a catalog release, or put in a pack. Every
 * collection mafteiach and JEM index is bibliographic facts and links and
 * ships. The Igros and Maanos come from a commercial app's data files
 * (packages/igros-index). Shmuly cleared the Igros Kodesh on 2026-09-24:
 * they ship, as a readable sefer whose letters the catalog API hosts. The
 * Maanos stay local until their rights are cleared too (docs/offline-plan.md,
 * section 6, decision 8). Flipping one of these is that decision, and
 * nothing else changes.
 *
 * `bin/release.ts` refuses a release that carries a gated collection, and
 * the pack builder (WP3) and packages/works read the same table.
 */
export const SHIPPABLE_COLLECTIONS = {
  farbrengens: true,
  likkuteiSichos: true,
  maamorim: true,
  yomanim: true,
  hadranim: true,
  michtavimKlolim: true,
  reshimos: true,
  jemEvents: true,
  igros: true,
  maanos: false,
} as const satisfies Record<string, boolean>;

export type KnownCollectionId = keyof typeof SHIPPABLE_COLLECTIONS;

/** The collections whose text packages/igros-index builds, each shipping only as the table above allows. */
export const GATED_COLLECTION_IDS = ['igros', 'maanos'] as const;
export type GatedCollectionId = (typeof GATED_COLLECTION_IDS)[number];

/** Unknown collection ids are not shippable either: a new collection ships once it is listed above. */
export function isShippable(collection: string): boolean {
  return (SHIPPABLE_COLLECTIONS as Record<string, boolean>)[collection] === true;
}

/** Throws, naming each one, when any of `collections` may not ship. */
export function assertShippable(collections: Iterable<string>, where: string): void {
  const blocked = [...new Set(collections)].filter((id) => !isShippable(id));
  if (blocked.length > 0) {
    throw new Error(`${where}: ${blocked.join(', ')} may not ship - see packages/catalog/src/rights.ts (the Maanos stay local until their rights are cleared)`);
  }
}
