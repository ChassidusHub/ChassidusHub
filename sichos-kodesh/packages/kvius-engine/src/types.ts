/** Day of week as returned by `HDate.getDay()`: 0 = Sunday ... 6 = Saturday. */
export type WeekdayCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The three ways a Hebrew year's length can vary within its leap/common
 * class, driven by whether Cheshvan gains a day or Kislev loses one:
 * - chaser ("deficient"): both Cheshvan and Kislev short (353 / 383 days)
 * - kesidran ("regular"): Cheshvan short, Kislev full (354 / 384 days)
 * - shalem ("complete"): both Cheshvan and Kislev full (355 / 385 days)
 */
export type YearType = 'chaser' | 'kesidran' | 'shalem';

/**
 * The full "kviah" of a Hebrew year: the combination of (leap status,
 * Rosh Hashana weekday, year-length class) that fully determines the
 * weekday-to-date mapping for every day of that year — and therefore the
 * entire Torah-reading and holiday-vs-Shabbos calendar. Two years with an
 * identical signature are "kvius-matched": same Sedra week structure
 * (subject to the same `il` flag), same relative placement of every fixed
 * Hebrew date against the days of the week.
 */
export interface KviusSignature {
  leap: boolean;
  roshHashanaDow: WeekdayCode;
  yearLength: number;
  yearType: YearType;
}

export interface HebrewDateParts {
  year: number;
  /** Native HDate month numbering: 1 = Nisan ... 7 = Tishrei ... 12 = Adar/Adar I ... 13 = Adar II (leap only). */
  month: number;
  day: number;
}

export interface WeeklyOccasion {
  kind: 'weekly';
  /** 0-based index anchored to the first Shabbat on or after Rosh Hashana. Stable matching key across kvius-matched years. */
  weekIndex: number;
  hebrewDate: HebrewDateParts;
  gregorianDate: string;
  /** Parsha name(s) read this Shabbat — two entries for a doubled parsha, null when a holiday displaces the weekly reading. */
  parsha: string[] | null;
  /** Set when a holiday (e.g. "Yom Kippur", "Pesach Shabbat Chol ha-Moed") displaces the weekly reading. */
  holiday: string | null;
}

/**
 * A recurring Hebrew-date-anchored occasion (a farbrengen tied to a fixed
 * date rather than a parsha, e.g. Yud-Tes Kislev). `month` may be a
 * resolver so Adar-anchored occasions land on the correct Adar (I vs II)
 * in a leap year without the caller needing to special-case it — since
 * kvius-matched years always share leap status, this resolves consistently
 * across the whole matched set.
 */
export interface FixedOccasionDef {
  /** Stable id used as the catalog/gap-resolution lookup key, e.g. "yud-tes-kislev". */
  key: string;
  label: string;
  day: number;
  month: number | ((hebrewYear: number) => number);
}

export interface FixedDateOccasion {
  kind: 'fixedDate';
  occasionKey: string;
  label: string;
  hebrewDate: HebrewDateParts;
  gregorianDate: string;
}

export interface MatchingYearsOptions {
  fromYear: number;
  toYear: number;
  /** Include the target year itself in the results (as a distance-0 match). Default false. */
  includeTarget?: boolean;
}

export interface MatchingYearResult {
  hebrewYear: number;
  distance: number;
}

export type GapStrategy = 'skip' | 'nearestKviusYear';

export type OccasionResolutionStatus = 'primary' | 'fallback' | 'manual' | 'gap';

export interface OccasionResolution {
  status: OccasionResolutionStatus;
  /** The Hebrew year whose recording should be served, or null when no recording could be resolved (a genuine gap). */
  resolvedYear: number | null;
}

export interface GapResolutionContext {
  sourceYear: number;
  gapStrategy: GapStrategy;
  /** Kvius-matched candidate years, used only for 'nearestKviusYear'. Order is irrelevant; resolveOccasion sorts internally by distance from sourceYear. */
  candidateYears: number[];
  hasRecording: (hebrewYear: number, occasionKey: string) => boolean;
  /** Per-occasion forced year, checked before the normal primary/fallback logic. */
  manualOverrides?: Record<string, number>;
}

export interface MatchedWeeklyEntry extends WeeklyOccasion {
  occasionKey: string;
  resolution: OccasionResolution;
}

export interface MatchedFixedEntry extends FixedDateOccasion {
  resolution: OccasionResolution;
}

export interface MatchedSchedule {
  targetYear: number;
  sourceYear: number;
  weekly: MatchedWeeklyEntry[];
  fixedDate: MatchedFixedEntry[];
}

export interface BuildMatchedScheduleOptions {
  /** Diaspora (false) vs Israel (true) Sedra schedule. */
  il: boolean;
  gapStrategy: GapStrategy;
  hasRecording: (hebrewYear: number, occasionKey: string) => boolean;
  manualOverrides?: Record<string, number>;
  /** Required when gapStrategy is 'nearestKviusYear': the year range to search for kvius-matched fallback candidates. */
  matchingYearsRange?: { fromYear: number; toYear: number };
  fixedOccasions?: FixedOccasionDef[];
}
