import { buildFixedDateSchedule, buildWeeklySchedule, MIN_HISTORICAL_YEAR } from '@sichos-kodesh/kvius-engine';
import type { FixedOccasionDef } from '@sichos-kodesh/kvius-engine';
import { toMafteiachHebrewDateKey } from './hebrewDateKey.js';
import type { CatalogEntry } from './types.js';

export type CatalogByYear = Record<number, CatalogEntry[]>;

/**
 * Resolves an engine `occasionKey` (see kvius-engine's `weeklyOccasionKey`/
 * `FixedOccasionDef.key`) to that occasion's actual Hebrew date in a given
 * year, then looks up the matching mafteiach-index occasion, if any.
 *
 * The engine's `hasRecording(hebrewYear, occasionKey)` callback (see
 * `GapResolutionContext`) is called with arbitrary candidate years and no
 * date of its own, so resolving "which date is this in this year" is what
 * this function does, for both occasion kinds: `weekIndex` is only a
 * stable key across kvius-matched years (they share week structure, not
 * the underlying dates), and a fixed-date key needs the same
 * `FixedOccasionDef` the caller used to build the schedule, so it's passed
 * in here too rather than assumed.
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

/**
 * True when an entry has real, downloadable content (audio or a PDF), not
 * just a bibliographic record. Named for content, not audio: an entry with
 * PDFs but no audio is still showable content, not a gap - e.g.
 * Nitzavim/Vayeilech (the last Shabbos before Rosh Hashana) regularly has
 * mugah/bilti-mugah PDF transcripts but no JEM audio in any kvius-matched
 * year.
 */
export function entryHasContent(entry: CatalogEntry): boolean {
  return entry.audio.length > 0 || entry.pdfs.length > 0;
}

/**
 * Every Hebrew year from `MIN_HISTORICAL_YEAR` (5710) onward in the
 * catalog with at least one real, downloadable entry (audio or a PDF),
 * sorted ascending. For "browse any year" mode: unlike `findMatchingYears`,
 * this isn't constrained to years kvius-matched to the current year, so
 * week/date alignment against "this week" doesn't apply - it's a plain
 * listing of what a given year actually has.
 *
 * Uses the same floor as `findMatchingYears`: this app is scoped to the
 * current Rebbe's own Sichos Kodesh (5710 onward), not the Previous
 * Rebbe's pre-Nesius farbrengens, even though mafteiach-index's crawl
 * (pre-Nesius records, `isPreNesius: true`) has content back to 5690.
 * Reshimos (private notes / the separately published series) is excluded
 * from the catalog entirely already, at the individual-link level (see
 * `driveLinks.ts`'s `isReshimosLabel`), unconditionally, not tied to this
 * or any other year cutoff.
 */
export function browsableYears(catalog: CatalogByYear): number[] {
  return Object.keys(catalog)
    .map(Number)
    .filter((year) => year >= MIN_HISTORICAL_YEAR && (catalog[year] ?? []).some(entryHasContent))
    .sort((a, b) => a - b);
}

/**
 * A `hasRecording` predicate (see kvius-engine's `GapResolutionContext`)
 * backed by the built catalog. Named `hasContent`, not `hasAudio`: see
 * `entryHasContent` - gating on audio alone would hide real downloadable
 * PDFs behind a "no recording" gap message.
 */
export function hasContent(
  catalog: CatalogByYear,
  il: boolean,
  fixedOccasions: FixedOccasionDef[],
): (hebrewYear: number, occasionKey: string) => boolean {
  return (hebrewYear, occasionKey) => {
    const entry = findCatalogEntryForOccasion(catalog, hebrewYear, occasionKey, il, fixedOccasions);
    return !!entry && entryHasContent(entry);
  };
}
