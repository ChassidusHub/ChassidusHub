import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { hebrewDayMonthLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

export interface ResolvedEntry {
  entry: CatalogEntry;
  /** Extra context line under the title - this occasion's own Hebrew day+month (no year - the entry's own year is already in the URL/page it's reached from). */
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
 *
 * Tries `resolveThisWeek` first (a real this-week occasion), then falls
 * back to a plain lookup anywhere in that source year - ThisWeekScreen's
 * "All of {year}" section links to occasions outside the current week too,
 * and they still deserve FarbrengenScreen's highlighted-hanacha treatment,
 * not just the generic browse one. `subtitle` is always this occasion's
 * own Hebrew day+month either way (see `useBrowseEntry`) - the real-week
 * Gregorian date a kvius match translates onto isn't this occasion's own
 * date and showing it read as "this year's date," which it isn't.
 */
export function useFollowEntry(): ResolvedEntry | null {
  const { sourceYear, occasionId } = useParams<{ sourceYear: string; occasionId: string }>();
  const { t, language } = useTranslation();
  return useMemo(() => {
    const year = Number(sourceYear);
    const id = Number(occasionId);
    const thisWeek = resolveThisWeek(year, catalog).find((o) => o.entry.occasionId === id);
    const entry = thisWeek?.entry ?? (catalog[year] ?? []).find((e) => e.occasionId === id);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      basePath: `/follow/${year}/${id}`,
      backPath: `/follow/${year}`,
      backLabel: t.backToThisWeek,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` changes identity with `language`, already covered by the language dependency it's derived from being global; re-including it here would just be noise.
  }, [sourceYear, occasionId, language]);
}

export function useBrowseEntry(): ResolvedEntry | null {
  const { hebrewYear, occasionId } = useParams<{ hebrewYear: string; occasionId: string }>();
  const { t, language } = useTranslation();
  return useMemo(() => {
    const year = Number(hebrewYear);
    const id = Number(occasionId);
    const entry = (catalog[year] ?? []).find((e) => e.occasionId === id);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      basePath: `/browse/${year}/${id}`,
      backPath: `/browse/${year}`,
      backLabel: t.backToYear(year),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see useFollowEntry
  }, [hebrewYear, occasionId, language]);
}

/**
 * Resolves an occasion reached via AllYearsThisWeekScreen - any year with
 * something indexed on one of this Hebrew week's dates, kvius-matched or
 * not (see `resolveThisWeekAllYears`). A plain year/occasionId lookup like
 * `useBrowseEntry`, just with its own back-path back to that cross-year
 * list instead of a year browse screen, so FarbrengenScreen's "back" link
 * returns to wherever the user actually came from.
 */
export function useThisWeekAllYearsEntry(): ResolvedEntry | null {
  const { hebrewYear, occasionId } = useParams<{ hebrewYear: string; occasionId: string }>();
  const { t, language } = useTranslation();
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
      backLabel: t.allFarbrengensThisWeekTitle,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see useFollowEntry
  }, [hebrewYear, occasionId, language]);
}
