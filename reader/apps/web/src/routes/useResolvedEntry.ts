import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { mafteiachMonthToken } from '@chassidushub-reader/catalog';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { useCatalog } from '../catalog/catalogStore';
import { hebrewDayMonthLabel } from '../utils/formatHebrewDate';
import { useLanguage } from '../i18n/useLanguage';
import { farbrengenPath } from './links';

export interface ResolvedEntry {
  entry: CatalogEntry;
  /** Extra context line under the title - this occasion's own Hebrew day+month (no year). */
  subtitle: string;
  /** This occasion's own address (a farbrengen's `/f/5711/11112833`, a library item's) - its PDF pages are nested under it. */
  basePath: string;
  /** Where Back goes when there is no history to pop: a farbrengen's month in its year. */
  backPath: string;
}

/**
 * The farbrengen a `/f/:hebrewYear/:occasionId` address names (routes/links.ts),
 * or `null` for one the catalog does not have (a bad or stale link) - the
 * page then says so. The month is re-derived from the entry's own date, so
 * a link opened fresh still has a Back that lands on its month.
 */
export function useFarbrengenEntry(): ResolvedEntry | null {
  const { hebrewYear, occasionId } = useParams<{ hebrewYear: string; occasionId: string }>();
  const { language } = useLanguage();
  const catalog = useCatalog();
  return useMemo(() => {
    const year = Number(hebrewYear);
    const id = Number(occasionId);
    const entry = (catalog[year] ?? []).find((e) => e.occasionId === id);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      basePath: farbrengenPath(year, id),
      backPath: `/browse/${year}/month/${mafteiachMonthToken(entry.hebrewDate)}`,
    };
  }, [catalog, hebrewYear, occasionId, language]);
}
