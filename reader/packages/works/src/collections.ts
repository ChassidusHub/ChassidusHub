import type { CatalogLibrary, CatalogRef, LibraryCollectionId, LibraryItemBase } from '@chassidushub-reader/catalog';
import { LIBRARY_COLLECTION_IDS } from '@chassidushub-reader/catalog';
import { workForCollection } from './registry/works.js';
import type { Edition, Unit } from './types.js';

/**
 * The seven collections the phone already browses (catalog schema 2), as
 * units of their works. A unit keeps its item's id, so downloads, listening
 * progress and packs made so far stay attached (the plan: "Their item ids
 * stay"). Their files are mafteiach's links (PDFs on Drive) and JEM's
 * recordings: what the apps ship today.
 */

function edition(ref: CatalogRef): Edition {
  const found: Edition = {
    source: ref.kind === 'audio' ? 'jem' : 'mafteiach',
    sourceId: ref.sourceId,
    kind: ref.kind === 'audio' ? 'audio' : ref.kind === 'text' ? 'text' : 'pdf',
    licence: 'facts-and-links',
  };
  if (ref.role !== undefined) found.role = ref.role;
  if (ref.label !== undefined) found.label = ref.label;
  return found;
}

function occasionIdsOf(item: LibraryItemBase): number[] | undefined {
  const record = item as LibraryItemBase & { occasionId?: unknown; occasionIds?: unknown };
  if (typeof record.occasionId === 'number') return [record.occasionId];
  if (Array.isArray(record.occasionIds) && record.occasionIds.every((id) => typeof id === 'number')) return record.occasionIds as number[];
  return undefined;
}

/** One collection's items as units of its work, in the collection's order. */
export function collectionUnits(library: CatalogLibrary, collection: LibraryCollectionId): Unit[] {
  const work = workForCollection(collection);
  return (library.collections[collection].items as LibraryItemBase[]).map((item) => {
    const unit: Unit = { id: item.id, workId: work.id, label: item.label, editions: item.refs.map(edition) };
    if (item.hebrewYear !== undefined) unit.hebrewYear = item.hebrewYear;
    if (item.hebrewDate !== undefined) unit.hebrewDate = item.hebrewDate;
    const occasionIds = occasionIdsOf(item);
    if (occasionIds) unit.occasionIds = occasionIds;
    return unit;
  });
}

/** Every collection's units, by work id. */
export function libraryUnits(library: CatalogLibrary): Map<string, Unit[]> {
  const byWork = new Map<string, Unit[]>();
  for (const collection of LIBRARY_COLLECTION_IDS) byWork.set(workForCollection(collection).id, collectionUnits(library, collection));
  return byWork;
}
