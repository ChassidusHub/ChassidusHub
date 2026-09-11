import { buildMatchedSchedule } from '@sichos-kodesh/kvius-engine';
import type { MatchedFixedEntry, MatchedWeeklyEntry, OccasionResolution } from '@sichos-kodesh/kvius-engine';
import { findCatalogEntryForOccasion, hasContent } from './catalogLookup.js';
import type { CatalogByYear } from './catalogLookup.js';
import { STARTER_FIXED_OCCASIONS } from './fixedOccasions.js';
import type { CatalogEntry } from './types.js';

export interface ThisOccasion {
  label: string;
  occasionKey: string;
  gregorianDate: string;
  resolution: OccasionResolution;
  /** The actual downloadable content for `resolution.resolvedYear`, if the resolution isn't a gap. */
  entry?: CatalogEntry;
}

/**
 * Picks the single most relevant occasion to show right now: an upcoming
 * fixed-date occasion (Yud-Tes Kislev, Purim, etc.) within the next 7 days
 * takes priority over the regular Shabbos schedule, since those are the
 * occasions users most associate with a specific date. Falls back to this
 * week's (nearest upcoming) Shabbos otherwise. A single-occasion view is a
 * deliberate MVP simplification - showing every upcoming occasion in a
 * list is real, straightforward follow-up work, not core to proving the
 * download-and-play-offline pipeline this pass exists to prove.
 *
 * Shared by apps/mobile and apps/web - both need the identical
 * kvius-to-catalog resolution, not two independently-maintained copies.
 */
export function resolveThisWeek(
  targetYear: number,
  sourceYear: number,
  il: boolean,
  catalog: CatalogByYear,
  today: Date = new Date(),
): ThisOccasion {
  const todayISO = today.toISOString().slice(0, 10);
  const sevenDaysOut = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const schedule = buildMatchedSchedule(targetYear, sourceYear, {
    il,
    gapStrategy: 'skip',
    hasRecording: hasContent(catalog, il, STARTER_FIXED_OCCASIONS),
    fixedOccasions: STARTER_FIXED_OCCASIONS,
  });

  const upcomingFixed = schedule.fixedDate.find((f) => f.gregorianDate >= todayISO && f.gregorianDate <= sevenDaysOut);
  const chosen: MatchedFixedEntry | MatchedWeeklyEntry =
    upcomingFixed ?? schedule.weekly.find((w) => w.gregorianDate >= todayISO) ?? schedule.weekly[schedule.weekly.length - 1]!;

  // Both MatchedFixedEntry and MatchedWeeklyEntry carry `occasionKey` directly (buildMatchedSchedule
  // adds it to both), but only the fixed-date one has a genuine `label` - a weekly entry's closest
  // equivalent is its parsha/holiday.
  const isFixed = 'label' in chosen;
  const label = isFixed ? (chosen as MatchedFixedEntry).label : ((chosen as MatchedWeeklyEntry).parsha?.join(' / ') ?? (chosen as MatchedWeeklyEntry).holiday ?? 'Shabbos');

  const entry =
    chosen.resolution.resolvedYear !== null
      ? findCatalogEntryForOccasion(catalog, chosen.resolution.resolvedYear, chosen.occasionKey, il, STARTER_FIXED_OCCASIONS)
      : undefined;

  return { label, occasionKey: chosen.occasionKey, gregorianDate: chosen.gregorianDate, resolution: chosen.resolution, entry };
}
