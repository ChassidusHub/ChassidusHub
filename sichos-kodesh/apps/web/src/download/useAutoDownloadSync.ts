import { useEffect } from 'react';
import { HDate } from '@hebcal/core';
import { currentHebrewYear, mafteiachMonthToken, resolveThisWeek, resolveWeekWithFallback, toMafteiachHebrewDateKey } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import catalog from '../catalog/data';
import type { DownloadSettings } from '../settings/useDownloadSettings';
import { useDownload } from './useDownload';

/**
 * Which occasions `settings` currently points at - a manually-pinned year
 * if set, otherwise the best current kvius match (the same default
 * KviusYearsScreen itself uses). Week scope reuses `resolveWeekWithFallback`
 * (the exact preference ThisWeekScreen's own suggestion already uses) when
 * fallback is on; month scope just lists whatever's indexed for that
 * Hebrew month in the source year, same as FollowMonthOccasionsScreen -
 * see DownloadSettingsScreen's own reasoning for not applying per-week
 * substitution inside a month browse.
 */
function resolveAutoDownloadEntries(settings: DownloadSettings, today: Date): CatalogEntry[] {
  const targetYear = currentHebrewYear();
  const sourceYear =
    settings.sourceYearMode === 'manual' && settings.manualSourceYear != null
      ? settings.manualSourceYear
      : (findMatchingYears(targetYear)[0]?.hebrewYear ?? targetYear);

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
    const entries = resolveAutoDownloadEntries(settings, new Date());
    if (entries.length > 0) enqueueBulk(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once per app load: a settings change mid-session should take effect on the *next* open, not retroactively re-run this.
  }, []);
}
