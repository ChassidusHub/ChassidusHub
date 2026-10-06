import { HDate } from '@hebcal/core';
import type { HebrewDateParts } from '@chassidushub-reader/kvius-engine';

/**
 * kvius-engine's `HebrewDateParts.month` uses HDate's native numbering
 * (1=Nisan ... 7=Tishrei ... 12=Adar/Adar I ... 13=Adar II, leap years
 * only). mafteiach-index's `hebrew_date` string keys use a different,
 * Tishrei-based convention instead (01=Tishrei ... 05=Shevat ... 07=Nisan
 * ... 12=Elul, with a leap year's Adar split into "06A"/"06B" rather than
 * shifting every later month's number, e.g. "5711-06A-14"/"5711-06B-14"
 * for Purim Koton / Purim in a leap year). This converts kvius-engine's
 * date parts into that exact string key so the catalog can look up a
 * mafteiach-index occasion by (hebrewYear, occasionKey).
 */
export function toMafteiachHebrewDateKey(parts: HebrewDateParts): string {
  const isLeap = HDate.isLeapYear(parts.year);
  let monthToken: string;
  switch (parts.month) {
    case 7: monthToken = '01'; break; // Tishrei
    case 8: monthToken = '02'; break; // Cheshvan
    case 9: monthToken = '03'; break; // Kislev
    case 10: monthToken = '04'; break; // Tevet
    case 11: monthToken = '05'; break; // Shevat
    case 12: monthToken = isLeap ? '06A' : '06'; break; // Adar / Adar I
    case 13: monthToken = '06B'; break; // Adar II (leap only)
    case 1: monthToken = '07'; break; // Nisan
    case 2: monthToken = '08'; break; // Iyar
    case 3: monthToken = '09'; break; // Sivan
    case 4: monthToken = '10'; break; // Tamuz
    case 5: monthToken = '11'; break; // Av
    case 6: monthToken = '12'; break; // Elul
    default:
      throw new RangeError(`Unexpected HDate-native month ${parts.month} for Hebrew year ${parts.year}`);
  }
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${monthToken}-${day}`;
}

/**
 * The reverse of the month switch above: a raw mafteiach-index month token
 * (see `mafteiachMonthToken`) back to HDate-native numbering - year-
 * independent, since a leap year's "06A"/plain "06" both originate from
 * the same HDate month 12 (Adar/Adar I) going forward, and
 * `toMafteiachHebrewDateKey` re-derives which one to emit per candidate
 * year from `HDate.isLeapYear` on its own. Used to look a specific
 * occasion's own date up across every other indexed year (see
 * `resolveOccasionAllYears`), not just the ones sharing its exact leap
 * status.
 */
export function mafteiachMonthTokenToHDateMonth(token: string): number {
  switch (token) {
    case '01': return 7; // Tishrei
    case '02': return 8; // Cheshvan
    case '03': return 9; // Kislev
    case '04': return 10; // Tevet
    case '05': return 11; // Shevat
    case '06': case '06A': return 12; // Adar / Adar I
    case '06B': return 13; // Adar II (leap only)
    case '07': return 1; // Nisan
    case '08': return 2; // Iyar
    case '09': return 3; // Sivan
    case '10': return 4; // Tamuz
    case '11': return 5; // Av
    case '12': return 6; // Elul
    default:
      throw new RangeError(`Unexpected mafteiach-index month token "${token}"`);
  }
}
