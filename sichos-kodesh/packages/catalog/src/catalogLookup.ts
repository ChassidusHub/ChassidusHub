import { buildFixedDateSchedule, buildWeeklySchedule } from '@sichos-kodesh/kvius-engine';
import type { FixedOccasionDef } from '@sichos-kodesh/kvius-engine';
import { toMafteiachHebrewDateKey } from './hebrewDateKey.js';
import type { CatalogEntry } from './types.js';

export type CatalogByYear = Record<number, CatalogEntry[]>;

/**
 * Resolves an engine `occasionKey` (see kvius-engine's `weeklyOccasionKey`/
 * `FixedOccasionDef.key`) to that occasion's actual Hebrew date *in a given
 * year*, then looks up the matching mafteiach-index occasion, if any.
 *
 * The engine's `hasRecording(hebrewYear, occasionKey)` callback (see
 * `GapResolutionContext`) is called with arbitrary candidate years and no
 * date of its own - resolving "which date is this in *this* year" is
 * exactly what this function does, for both occasion kinds: `weekIndex` is
 * only a stable key *across* kvius-matched years (they share week
 * structure, not the underlying dates), and a fixed-date key needs the
 * same `FixedOccasionDef` the caller used to build the schedule in the
 * first place, so it must be passed in here too rather than assumed.
 */
export function findCatalogEntryForOccasion(
  catalog: CatalogByYear,
  hebrewYear: number,
  occasionKey: string,
  il: boolean,
  fixedOccasions: FixedOccasionDef[],
): CatalogEntry | undefined {
  const yearEntries = catalog[hebrewYear] ?? [];
  const hebrewDateKey = resolveOccasionKeyToHebrewDateKey(hebrewYear, occasionKey, il, fixedOccasions);
  if (!hebrewDateKey) return undefined;
  return yearEntries.find((entry) => entry.hebrewDate === hebrewDateKey);
}

function resolveOccasionKeyToHebrewDateKey(
  hebrewYear: number,
  occasionKey: string,
  il: boolean,
  fixedOccasions: FixedOccasionDef[],
): string | null {
  if (occasionKey.startsWith('week:')) {
    const weekIndex = Number(occasionKey.slice('week:'.length));
    const occasion = buildWeeklySchedule(hebrewYear, il)[weekIndex];
    return occasion ? toMafteiachHebrewDateKey(occasion.hebrewDate) : null;
  }
  const def = fixedOccasions.find((d) => d.key === occasionKey);
  if (!def) return null;
  const occasion = buildFixedDateSchedule(hebrewYear, [def])[0];
  return occasion ? toMafteiachHebrewDateKey(occasion.hebrewDate) : null;
}

/** A `hasRecording` predicate (see kvius-engine's `GapResolutionContext`) backed by the built catalog. */
export function hasRecording(
  catalog: CatalogByYear,
  il: boolean,
  fixedOccasions: FixedOccasionDef[],
): (hebrewYear: number, occasionKey: string) => boolean {
  return (hebrewYear, occasionKey) => {
    const entry = findCatalogEntryForOccasion(catalog, hebrewYear, occasionKey, il, fixedOccasions);
    return !!entry && entry.audio.length > 0;
  };
}
