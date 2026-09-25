import { useEffect, useRef } from 'react';
import { useOnlineMode } from '../appMode/appMode';
import { HDate } from '@hebcal/core';
import { currentHebrewYear, mafteiachMonthToken, resolveThisWeek, resolveWeekWithFallback, toMafteiachHebrewDateKey } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { IL } from '../config';
import { getCatalog, getLibrary } from '../catalog/catalogStore';
import { resolveLibraryAutoTargets } from '../library/libraryAutoDownload';
import type { DownloadSettings } from './downloadSettings';
import { useDownload } from './useDownload';

/** One source year's own occasions for the current week/month - run once per selected year and unioned. */
function resolveEntriesForYear(sourceYear: number, targetYear: number, settings: DownloadSettings, today: Date): CatalogEntry[] {
  if (settings.scope === 'week') {
    if (settings.useKviusFallback) {
      return (resolveWeekWithFallback(sourceYear, targetYear, getCatalog(), IL, today)?.occasions ?? []).map((occasion) => occasion.entry);
    }
    return resolveThisWeek(sourceYear, getCatalog(), today).map((occasion) => occasion.entry);
  }

  const hdate = new HDate(today);
  const monthToken = mafteiachMonthToken(toMafteiachHebrewDateKey({ year: sourceYear, month: hdate.getMonth(), day: hdate.getDate() }));
  return (getCatalog()[sourceYear] ?? []).filter((entry) => mafteiachMonthToken(entry.hebrewDate) === monthToken);
}

/** The source year(s) the automatic sync follows: the manually pinned ones if set, otherwise the best current kvius match. */
export function autoSourceYears(settings: DownloadSettings): number[] {
  const targetYear = currentHebrewYear();
  return settings.sourceYearMode === 'manual' && settings.manualSourceYears.length > 0 ? settings.manualSourceYears : [findMatchingYears(targetYear)[0]?.hebrewYear ?? targetYear];
}

/** Which occasions `settings` currently points at - one or more manually-pinned years if set, otherwise the best current kvius match (the same default KviusYearsScreen itself uses). Same resolution as the web's useAutoDownloadSync. */
export function resolveAutoDownloadEntries(settings: DownloadSettings, today: Date): CatalogEntry[] {
  const targetYear = currentHebrewYear();
  const sourceYears = autoSourceYears(settings);

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
 * Sync-on-open: runs once, silently, whenever the app is actually opened
 * (once the persisted settings have loaded) - a settings change mid-session
 * takes effect on the *next* open, not retroactively. A short grace delay
 * before the first fetch gives a cold launch's radio/DNS time to come up.
 */
export function useAutoDownloadSync(): void {
  const { settings, hydrated, enqueueBulk, enqueueTargets } = useDownload();
  const onlineMode = useOnlineMode();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!hydrated || ranRef.current) return;
    ranRef.current = true;
    // Offline pack mode never downloads, the automatic download included.
    if (!settings.autoDownloadEnabled || !onlineMode) return;
    const timer = setTimeout(() => {
      const today = new Date();
      const entries = resolveAutoDownloadEntries(settings, today);
      if (entries.length > 0) enqueueBulk(entries, 'auto').catch(() => undefined);
      // Phone only: the library collections the user asked to keep ready, after the farbrengens.
      const libraryTargets = resolveLibraryAutoTargets(getLibrary(), settings.libraryAutoDownload, autoSourceYears(settings), today);
      if (libraryTargets.length > 0) enqueueTargets(libraryTargets, 'auto').catch(() => undefined);
    }, 2500);
    return () => clearTimeout(timer);
  }, [enqueueBulk, enqueueTargets, hydrated, onlineMode, settings]);
}
