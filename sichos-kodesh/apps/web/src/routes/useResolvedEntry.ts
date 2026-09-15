import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { mafteiachMonthToken, resolveThisWeek } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { hebrewDayMonthLabel } from '../utils/formatHebrewDate';
import { useLanguage } from '../i18n/useLanguage';

export interface ResolvedEntry {
  entry: CatalogEntry;
  /** Extra context line under the title - this occasion's own Hebrew day+month (no year - the entry's own year is already in the URL/page it's reached from). */
  subtitle: string;
  /** This occasion's own URL, e.g. `/browse/5711/11112833` - RecordingsScreen/PdfViewerScreen routes are nested under it. */
  basePath: string;
  backPath: string;
}

/**
 * Re-derives which occasion a URL points to. `resolveThisWeek` is cheap
 * (a plain week of catalog lookups), so recomputing it from the URL on
 * every navigation, including a hard refresh landing directly on a deep
 * link, is simpler than caching it. Returns `null` for a URL naming an
 * occasion that doesn't resolve (bad/stale param) - callers should
 * render a "not found" state.
 *
 * Tries `resolveThisWeek` first (a real this-week occasion, back-linking
 * to ThisWeekScreen), then falls back to a plain lookup anywhere in that
 * source year (back-linking to that month's own occasion list instead -
 * see `useBrowseEntry`), since FollowMonthListScreen/
 * FollowMonthOccasionsScreen link to occasions outside the current week
 * too and those should still get FarbrengenScreen's highlighted-hanacha
 * treatment. `subtitle` is always this occasion's own Hebrew day+month
 * either way - the real-week Gregorian date a kvius match translates
 * onto isn't this occasion's own date.
 */
export function useFollowEntry(): ResolvedEntry | null {
  const { sourceYear, occasionId } = useParams<{ sourceYear: string; occasionId: string }>();
  const { language } = useLanguage();
  return useMemo(() => {
    const year = Number(sourceYear);
    const id = Number(occasionId);
    const thisWeek = resolveThisWeek(year, catalog).find((o) => o.entry.occasionId === id);
    const entry = thisWeek?.entry ?? (catalog[year] ?? []).find((e) => e.occasionId === id);
    if (!entry) return null;
    const base = { entry, subtitle: hebrewDayMonthLabel(entry.hebrewDate, language), basePath: `/follow/${year}/${id}` };
    if (thisWeek) return { ...base, backPath: `/follow/${year}` };
    const monthToken = mafteiachMonthToken(entry.hebrewDate);
    return { ...base, backPath: `/follow/${year}/month/${monthToken}` };
  }, [sourceYear, occasionId, language]);
}

/**
 * A plain year/occasionId lookup, back-linking to that specific month's
 * own occasion list (MonthOccasionsScreen). The month is re-derived from
 * the entry's own `hebrewDate`, not carried in the URL, so a deep link
 * straight to an occasion still gets a correct "back" instead of
 * skipping past the month list.
 */
export function useBrowseEntry(): ResolvedEntry | null {
  const { hebrewYear, occasionId } = useParams<{ hebrewYear: string; occasionId: string }>();
  const { language } = useLanguage();
  return useMemo(() => {
    const year = Number(hebrewYear);
    const id = Number(occasionId);
    const entry = (catalog[year] ?? []).find((e) => e.occasionId === id);
    if (!entry) return null;
    const monthToken = mafteiachMonthToken(entry.hebrewDate);
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      basePath: `/browse/${year}/${id}`,
      backPath: `/browse/${year}/month/${monthToken}`,
    };
  }, [hebrewYear, occasionId, language]);
}

/**
 * Resolves an occasion reached via AllYearsThisWeekScreen - a plain
 * year/occasionId lookup like `useBrowseEntry`, with its own back-path
 * to that cross-year list instead of a year browse screen.
 */
export function useThisWeekAllYearsEntry(): ResolvedEntry | null {
  const { hebrewYear, occasionId } = useParams<{ hebrewYear: string; occasionId: string }>();
  const { language } = useLanguage();
  return useMemo(() => {
    const year = Number(hebrewYear);
    const id = Number(occasionId);
    const entry = (catalog[year] ?? []).find((e) => e.occasionId === id);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      basePath: `/this-week-all-years/${year}/${id}`,
      backPath: '/this-week-all-years',
    };
  }, [hebrewYear, occasionId, language]);
}

/**
 * Resolves an occasion reached via OccasionAllYearsScreen.
 * `sourceHebrewYear`/`sourceOccasionId` identify which occasion the list
 * was generated from, so both the list and this page's back-link can be
 * regenerated from the URL alone.
 */
export function useOccasionAllYearsEntry(): ResolvedEntry | null {
  const { sourceHebrewYear, sourceOccasionId, hebrewYear, occasionId } = useParams<{
    sourceHebrewYear: string;
    sourceOccasionId: string;
    hebrewYear: string;
    occasionId: string;
  }>();
  const { language } = useLanguage();
  return useMemo(() => {
    const year = Number(hebrewYear);
    const id = Number(occasionId);
    const entry = (catalog[year] ?? []).find((e) => e.occasionId === id);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      basePath: `/occasion-all-years/${sourceHebrewYear}/${sourceOccasionId}/${year}/${id}`,
      backPath: `/occasion-all-years/${sourceHebrewYear}/${sourceOccasionId}`,
    };
  }, [sourceHebrewYear, sourceOccasionId, hebrewYear, occasionId, language]);
}
