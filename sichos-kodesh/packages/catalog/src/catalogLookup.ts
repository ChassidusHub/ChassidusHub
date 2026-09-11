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

/**
 * True when an entry has real, downloadable content (audio or a PDF), not
 * just a bibliographic record. Named for content, not audio: an entry with
 * PDFs but no audio is real, showable content, not a gap - a real, verified
 * case (e.g. Nitzavim/Vayeilech, the last Shabbos before Rosh Hashana,
 * regularly has mugah/bilti-mugah PDF transcripts but zero JEM audio across
 * every kvius-matched year checked).
 */
export function entryHasContent(entry: CatalogEntry): boolean {
  return entry.audio.length > 0 || entry.pdfs.length > 0;
}

/**
 * Every Hebrew year in the catalog with at least one real, downloadable
 * entry (audio or a PDF) - sorted ascending. For "browse any year" mode:
 * unlike `findMatchingYears`, this isn't constrained to years that are
 * kvius-matched to the current year, so week/date alignment against
 * "this week" doesn't apply - it's a plain listing of what a given year
 * actually has, for a user who wants to explore rather than follow along.
 */
export function browsableYears(catalog: CatalogByYear): number[] {
  return Object.keys(catalog)
    .map(Number)
    .filter((year) => (catalog[year] ?? []).some(entryHasContent))
    .sort((a, b) => a - b);
}

/**
 * A `hasRecording` predicate (see kvius-engine's `GapResolutionContext`) backed
 * by the built catalog. Named `hasContent`, not `hasAudio`: it counts an entry
 * with PDFs but no audio as real, showable content, not a gap - a real,
 * verified case (e.g. Nitzavim/Vayeilech, the last Shabbos before Rosh
 * Hashana, regularly has mugah/bilti-mugah PDF transcripts but zero JEM
 * audio across every kvius-matched year checked). Gating on audio alone
 * would hide real downloadable PDFs behind a "no recording" gap message.
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
