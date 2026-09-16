import { useEffect } from 'react';
import { HDate } from '@hebcal/core';
import { currentHebrewYear, mafteiachMonthToken, resolveThisWeek, resolveWeekWithFallback, toMafteiachHebrewDateKey } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import catalog from '../catalog/data';
import type { DownloadSettings } from '../settings/useDownloadSettings';
import { useDownload } from './useDownload';

/** One source year's own occasions for the current week/month - the single-year resolution `resolveAutoDownloadEntries` runs once per selected year and unions together. */
function resolveEntriesForYear(sourceYear: number, targetYear: number, settings: DownloadSettings, today: Date): CatalogEntry[] {
  if (settings.scope === 'week') {
    if (settings.useKviusFallback) {
      return (resolveWeekWithFallback(sourceYear, targetYear, catalog, today)?.occasions ?? []).map((occasion) => occasion.entry);
    }
    return resolveThisWeek(sourceYear, catalog, today).map((occasion) => occasion.entry);
  }

  const hdate = new HDate(today);
  const monthToken = mafteiachMonthToken(toMafteiachHebrewDateKey({ year: sourceYear, month: hdate.getMonth(), day: hdate.getDate() }));
  return (catalog[sourceYear] ?? []).filter((entry) => mafteiachMonthToken(entry.hebrewDate) === monthToken);
}

/**
 * Which occasions `settings` currently points at - one or more
 * manually-pinned years if set, otherwise the best current kvius match
 * (the same default KviusYearsScreen itself uses). Week scope reuses
 * `resolveWeekWithFallback` (the exact preference ThisWeekScreen's own
 * suggestion already uses) when fallback is on; month scope just lists
 * whatever's indexed for that Hebrew month in the source year, same as
 * FollowMonthOccasionsScreen - see DownloadSettingsScreen's own reasoning
 * for not applying per-week substitution inside a month browse. Each
 * selected year is resolved independently and the results unioned (see
 * DownloadSettings.manualSourceYears's own doc comment) - deduped by
 * occasion identity in case two selected years' own fallback resolution
 * happens to land on the same one.
 */
function resolveAutoDownloadEntries(settings: DownloadSettings, today: Date): CatalogEntry[] {
  const targetYear = currentHebrewYear();
  const sourceYears = settings.sourceYearMode === 'manual' && settings.manualSourceYears.length > 0 ? settings.manualSourceYears : [findMatchingYears(targetYear)[0]?.hebrewYear ?? targetYear];

  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  for (const sourceYear of sourceYears) {
    for (const entry of resolveEntriesForYear(sourceYear, targetYear, settings, today)) {
      const key = `${entry.hebrewYear}:${entry.occasionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * The one universally-working "auto download" mechanism (see
 * DownloadSettingsScreen) - true background downloading while the app is
 * closed isn't reliably available on every platform (iOS Safari has no
 * background-sync API at all), so this runs once, silently, whenever the
 * app is actually opened instead. Mounted once in AppContent, alongside
 * useScrollToTopOnNavigate - runs on the initial mount only, not on every
 * navigation, so browsing around the app doesn't repeatedly re-trigger it.
 */
export function useAutoDownloadSync(): void {
  const { settings, enqueueBulk } = useDownload();

  useEffect(() => {
    if (!settings.autoDownloadEnabled) return;
    // Firing this sync's fetches the instant the app mounts can race a cold
    // PWA launch's network stack still coming back up (Wi-Fi radio waking
    // from sleep, DNS not yet resolvable) - a real, observed failure mode
    // that has nothing to do with actual connectivity, but downloadManager
    // can't tell it apart from a genuine offline fetch (see
    // useConnectivityRecheckTriggers's matching comment) and would
    // false-flip the whole app's connectivity banner red for the first
    // moment of every cold start, "reconnecting" a second later once the
    // radio's actually up. A short grace delay before this background
    // sync's own first fetch gives that race time to resolve on its own -
    // same spirit as the retry-once pattern PlayerProvider/PdfViewerScreen
    // use for the same underlying problem, just ahead of time instead of
    // after the fact, since this sync has no user waiting on it either way.
    const timer = setTimeout(() => {
      const entries = resolveAutoDownloadEntries(settings, new Date());
      if (entries.length > 0) enqueueBulk(entries);
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once per app load: a settings change mid-session should take effect on the *next* open, not retroactively re-run this.
  }, []);
}
