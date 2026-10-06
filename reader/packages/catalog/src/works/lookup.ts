import type { CatalogContentsEntry, CatalogEdition, CatalogUnit, CatalogWork, CatalogWorkContents, CatalogWorksIndex, CatalogWorkSource } from './types.js';

/** A work by id. */
export function catalogWork(works: CatalogWorksIndex, id: string): CatalogWork | undefined {
  return works.works.find((work) => work.id === id);
}

/** Each author's works, in the catalog's order: the Rebbeim in their order, then the rest. */
export function worksByAuthor(works: CatalogWorksIndex): Map<string, CatalogWork[]> {
  const byAuthor = new Map<string, CatalogWork[]>(works.authors.map((author) => [author.id, []]));
  for (const work of works.works) for (const author of work.authors) byAuthor.get(author)?.push(work);
  return byAuthor;
}

/** A unit of an imported work. */
export function catalogUnit(contents: CatalogWorkContents, unitId: string): CatalogUnit | undefined {
  return contents.units.find((unit) => unit.id === unitId);
}

/** The units in reading order: the contents flattened, so "next" and "previous" follow the sefer. */
export function unitsInOrder(contents: CatalogWorkContents): CatalogUnit[] {
  const byId = new Map(contents.units.map((unit) => [unit.id, unit]));
  const ordered: CatalogUnit[] = [];
  const walk = (entries: readonly CatalogContentsEntry[]) => {
    for (const entry of entries) {
      if ('unitId' in entry) {
        const unit = byId.get(entry.unitId);
        if (unit) ordered.push(unit);
      } else walk(entry.entries);
    }
  };
  walk(contents.contents);
  return ordered;
}

/** An edition's source, from its work. */
export function editionSource(work: CatalogWork, edition: CatalogEdition): CatalogWorkSource | undefined {
  return work.sources[edition.source];
}
