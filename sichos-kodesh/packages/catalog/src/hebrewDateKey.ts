import { HDate } from '@hebcal/core';
import type { HebrewDateParts } from '@sichos-kodesh/kvius-engine';

/**
 * kvius-engine's `HebrewDateParts.month` uses HDate's native numbering
 * (1=Nisan ... 7=Tishrei ... 12=Adar/Adar I ... 13=Adar II, leap years
 * only). mafteiach-index's `hebrew_date` string keys use a different,
 * Tishrei-based convention instead (01=Tishrei ... 05=Shevat ... 07=Nisan
 * ... 12=Elul, with a leap year's Adar split into "06A"/"06B" rather than
 * shifting every later month's number) - confirmed against the real
 * crawled dataset (e.g. "5711-05-10" for Yud Shevat 5711, "5711-06A-14"/
 * "5711-06B-14" for Purim Koton / Purim in a leap year). This converts
 * kvius-engine's date parts into that exact string key so the catalog can
 * look up a mafteiach-index occasion by (hebrewYear, occasionKey).
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
