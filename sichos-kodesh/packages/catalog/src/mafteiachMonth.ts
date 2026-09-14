/**
 * Display name for mafteiach-index's Tishrei-based month token (see
 * `toMafteiachHebrewDateKey`'s doc comment for the full numbering
 * convention) - used to group a year's occasions by month when browsing.
 */
const MAFTEIACH_MONTH_NAMES: Record<string, string> = {
  '01': 'Tishrei',
  '02': 'Cheshvan',
  '03': 'Kislev',
  '04': 'Teves',
  '05': 'Shevat',
  '06': 'Adar',
  '06A': 'Adar I',
  '06B': 'Adar II',
  '07': 'Nisan',
  '08': 'Iyar',
  '09': 'Sivan',
  '10': 'Tamuz',
  '11': 'Av',
  '12': 'Elul',
};

/** Hebrew-language counterpart to `MAFTEIACH_MONTH_NAMES`, for the Hebrew UI. */
const MAFTEIACH_MONTH_NAMES_HE: Record<string, string> = {
  '01': 'תשרי',
  '02': 'חשוון',
  '03': 'כסלו',
  '04': 'טבת',
  '05': 'שבט',
  '06': 'אדר',
  '06A': 'אדר א׳',
  '06B': 'אדר ב׳',
  '07': 'ניסן',
  '08': 'אייר',
  '09': 'סיוון',
  '10': 'תמוז',
  '11': 'אב',
  '12': 'אלול',
};

/** Extracts the month token from a raw mafteiach-index date key, e.g. "5711-06A-14" -> "06A". */
export function mafteiachMonthToken(hebrewDate: string): string {
  return hebrewDate.split('-')[1] ?? '';
}

/** The display name for a raw mafteiach-index date key's month, e.g. "5711-05-10" -> "Shevat". */
export function mafteiachMonthName(hebrewDate: string): string {
  const token = mafteiachMonthToken(hebrewDate);
  return MAFTEIACH_MONTH_NAMES[token] ?? token;
}

/** Hebrew-language counterpart to `mafteiachMonthName`, e.g. "5711-05-10" -> "שבט". */
export function mafteiachMonthNameHebrew(hebrewDate: string): string {
  const token = mafteiachMonthToken(hebrewDate);
  return MAFTEIACH_MONTH_NAMES_HE[token] ?? token;
}

/**
 * Extracts the day-of-month from a raw mafteiach-index date key, e.g.
 * "5711-05-10" -> 10. Two occasions landing on the same calendar date get
 * a trailing disambiguator letter in the real crawled data (e.g.
 * "5711-01-09b" for a second occasion on the 9th) - stripped here, since
 * it's not part of the day number itself (see `mafteiachMonthToken`'s
 * sibling test for the same convention on the month side).
 */
export function mafteiachDay(hebrewDate: string): number {
  return Number.parseInt(hebrewDate.split('-')[2] ?? '0', 10);
}
