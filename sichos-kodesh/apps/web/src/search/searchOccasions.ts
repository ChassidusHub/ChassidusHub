import { EMPTY_FILTERS, hasActiveFilters, isChagCategory, normalize } from '@sichos-kodesh/app-core';
import { searchOccasions as searchOccasionsCore } from '@sichos-kodesh/app-core';
import type { ContentType, SearchFilters, SearchResultGroup } from '@sichos-kodesh/app-core';
import type { CatalogByYear } from '@sichos-kodesh/catalog';
import { IL } from '../config';

export { EMPTY_FILTERS, hasActiveFilters, isChagCategory, normalize };
export type { ContentType, SearchFilters, SearchResultGroup };

export function searchOccasions(catalog: CatalogByYear, filters: SearchFilters): SearchResultGroup[] {
  return searchOccasionsCore(catalog, filters, IL);
}
