import type { CatalogLibrary, CatalogRef, LibraryCollection, LibraryGroup, LibraryItemBase, OccasionGroup } from './types.js';
import { LIBRARY_COLLECTION_IDS } from './types.js';
import { GATED_COLLECTION_IDS } from '../rights.js';

/**
 * Validates a library read from a fetched or stored release. Checks what
 * every screen relies on - ids, labels, refs, groups - and keeps each
 * collection's own fields as they are. One malformed item rejects the whole
 * library, the same rule as the farbrengens: a half-applied catalog is
 * worse than the bundled one.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRef(value: unknown): value is CatalogRef {
  if (!isRecord(value)) return false;
  const { kind, sourceId, role, label, durationMs, resourceKey } = value;
  if (kind !== 'audio' && kind !== 'pdf' && kind !== 'text') return false;
  if (typeof sourceId !== 'string' || sourceId.length === 0) return false;
  if (role !== undefined && typeof role !== 'string') return false;
  if (label !== undefined && typeof label !== 'string') return false;
  if (durationMs !== undefined && typeof durationMs !== 'number') return false;
  return resourceKey === undefined || typeof resourceKey === 'string';
}

function isItem(value: unknown): value is LibraryItemBase {
  if (!isRecord(value)) return false;
  const { id, label, hebrewYear, hebrewDate, refs } = value;
  if (typeof id !== 'string' || id.length === 0 || typeof label !== 'string') return false;
  if (hebrewYear !== undefined && typeof hebrewYear !== 'number') return false;
  if (hebrewDate !== undefined && typeof hebrewDate !== 'string') return false;
  return Array.isArray(refs) && refs.every(isRef);
}

function isGroup(value: unknown): value is LibraryGroup {
  if (!isRecord(value)) return false;
  return typeof value.slug === 'string' && typeof value.name === 'string' && Array.isArray(value.itemIds) && value.itemIds.every((id) => typeof id === 'string');
}

function isOccasionGroup(value: unknown): value is OccasionGroup {
  if (!isRecord(value)) return false;
  return typeof value.slug === 'string' && typeof value.name === 'string' && Array.isArray(value.occasionIds) && value.occasionIds.every((id) => typeof id === 'number');
}

function isCollection(value: unknown): value is LibraryCollection<LibraryItemBase> {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.groups)) return false;
  if (!value.items.every(isItem)) return false;
  return Object.values(value.groups).every((groups) => Array.isArray(groups) && groups.every(isGroup));
}

export function parseCatalogLibrary(value: unknown): CatalogLibrary | null {
  if (!isRecord(value) || !isRecord(value.collections)) return null;
  if (!Array.isArray(value.moadim) || !value.moadim.every(isOccasionGroup)) return null;
  if (!Array.isArray(value.parshiyos) || !value.parshiyos.every(isOccasionGroup)) return null;
  for (const id of LIBRARY_COLLECTION_IDS) {
    if (!isCollection(value.collections[id])) return null;
  }
  // A library that carries a gated collection (src/rights.ts) never reaches an app.
  if (GATED_COLLECTION_IDS.some((id) => id in (value.collections as Record<string, unknown>))) return null;
  return value as unknown as CatalogLibrary;
}
