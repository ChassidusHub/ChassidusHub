import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';

export interface ResolvedEntry {
  entry: CatalogEntry;
  /** Extra context line under the title - the Gregorian date for a "follow" occasion, the raw Hebrew date for a "browse" one. */
  subtitle: string;
  /** This occasion's own URL, e.g. `/browse/5711/11112833` - RecordingsScreen/PdfViewerScreen routes are nested under it. */
  basePath: string;
  backPath: string;
  backLabel: string;
}

/**
 * Re-derives which occasion a URL points to, the same way the previous
 * (pre-routing) screens derived it from in-memory state - `resolveThisWeek`
 * is cheap (a plain week of catalog lookups), so recomputing it from a URL
 * param on every navigation (including a hard refresh landing directly on
 * a deep link) is simpler and just as correct as caching it. Returns
 * `null` for a URL naming an occasion that doesn't actually resolve
 * (bad/stale param) - callers should render a "not found" state.
 */
export function useFollowEntry(): ResolvedEntry | null {
  const { sourceYear, occasionId } = useParams<{ sourceYear: string; occasionId: string }>();
  return useMemo(() => {
    const year = Number(sourceYear);
    const id = Number(occasionId);
    const occasion = resolveThisWeek(year, catalog).find((o) => o.entry.occasionId === id);
    if (!occasion) return null;
    return {
      entry: occasion.entry,
      subtitle: occasion.gregorianDate,
      basePath: `/follow/${year}/${id}`,
      backPath: `/follow/${year}`,
      backLabel: '< back to this week',
    };
  }, [sourceYear, occasionId]);
}

export function useBrowseEntry(): ResolvedEntry | null {
  const { hebrewYear, occasionId } = useParams<{ hebrewYear: string; occasionId: string }>();
  return useMemo(() => {
    const year = Number(hebrewYear);
    const id = Number(occasionId);
    const entry = (catalog[year] ?? []).find((e) => e.occasionId === id);
    if (!entry) return null;
    return {
      entry,
      subtitle: entry.hebrewDate,
      basePath: `/browse/${year}/${id}`,
      backPath: `/browse/${year}`,
      backLabel: `< back to ${year}`,
    };
  }, [hebrewYear, occasionId]);
}
