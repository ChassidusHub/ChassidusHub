import { resolveOccasion } from './gapHandling.js';
import { kviusSignature, sameKvius } from './hebrewCalendar.js';
import { MAX_HISTORICAL_YEAR, findMatchingYears } from './matching.js';
import { buildFixedDateSchedule, buildWeeklySchedule, weeklyOccasionKey } from './schedule.js';
import type { BuildMatchedScheduleOptions, GapResolutionContext, MatchedSchedule } from './types.js';

/**
 * The engine's top-level entry point: given the current ("target") Hebrew
 * year, a chosen historical ("source") year to follow along with, and a
 * catalog-availability predicate, produces the full week-by-week and
 * fixed-date schedule of which source-year (or fallback-year) recording
 * plays for each occasion of the target year.
 *
 * Throws if `sourceYear` isn't actually kvius-matched to `targetYear` —
 * callers should only offer years from {@link findMatchingYears} as source
 * year choices in the first place. Also throws if sourceYear is after 5752
 * unless allowPost5752 is true.
 */
export function buildMatchedSchedule(
  targetYear: number,
  sourceYear: number,
  options: BuildMatchedScheduleOptions,
): MatchedSchedule {
  if (sourceYear > MAX_HISTORICAL_YEAR && !options.allowPost5752) {
    throw new RangeError(
      `Hebrew year ${sourceYear} is after ${MAX_HISTORICAL_YEAR}; the Sichos Kodesh catalog ends in 5752.`,
    );
  }
  if (!sameKvius(kviusSignature(targetYear), kviusSignature(sourceYear))) {
    throw new RangeError(
      `Hebrew year ${sourceYear} is not kvius-matched to ${targetYear}; only offer source years returned by findMatchingYears()`,
    );
  }
  if (options.gapStrategy === 'nearestKviusYear' && !options.matchingYearsRange) {
    throw new RangeError("matchingYearsRange is required when gapStrategy is 'nearestKviusYear'");
  }

  const candidateYears = options.matchingYearsRange
    ? findMatchingYears(targetYear, options.matchingYearsRange).map((r) => r.hebrewYear)
    : [];

  const ctx: GapResolutionContext = {
    sourceYear,
    gapStrategy: options.gapStrategy,
    candidateYears,
    hasRecording: options.hasRecording,
    manualOverrides: options.manualOverrides,
  };

  const weekly = buildWeeklySchedule(targetYear, options.il).map((occasion) => {
    const occasionKey = weeklyOccasionKey(occasion.weekIndex);
    return { ...occasion, occasionKey, resolution: resolveOccasion(occasionKey, ctx) };
  });

  const fixedDate = buildFixedDateSchedule(targetYear, options.fixedOccasions ?? []).map((occasion) => ({
    ...occasion,
    resolution: resolveOccasion(occasion.occasionKey, ctx),
  }));

  return { targetYear, sourceYear, weekly, fixedDate };
}
