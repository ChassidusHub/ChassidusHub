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

/** Extracts the month token from a raw mafteiach-index date key, e.g. "5711-06A-14" -> "06A". */
export function mafteiachMonthToken(hebrewDate: string): string {
  return hebrewDate.split('-')[1] ?? '';
}

/** The display name for a raw mafteiach-index date key's month, e.g. "5711-05-10" -> "Shevat". */
export function mafteiachMonthName(hebrewDate: string): string {
  const token = mafteiachMonthToken(hebrewDate);
  return MAFTEIACH_MONTH_NAMES[token] ?? token;
}
