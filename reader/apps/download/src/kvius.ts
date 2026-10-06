import { HDate, months } from '@hebcal/core';
import { findMatchingYears, kviusCode } from '@chassidushub-reader/kvius-engine';
import { MONTHS } from './selection';

/**
 * The kvius: the years whose calendar is this year's - the same weekdays,
 * the same parshiyos (kvius-engine's findMatchingYears) - which the app's
 * home follows week by week. The site offers them in one tap, and marks
 * them, with this month and the next, wherever years and months are picked.
 */

export interface Kvius {
  /** This Hebrew year, e.g. 5787. */
  year: number;
  /** Its three-letter mnemonic, e.g. "בשה". */
  code: string;
  /** The published years that share it, oldest first. */
  years: number[];
}

export function kviusOf(today: Date, published: number[]): Kvius {
  const year = new HDate(today).getFullYear();
  const matching = new Set(findMatchingYears(year).map((m) => m.hebrewYear));
  return { year, code: kviusCode(year), years: published.filter((y) => matching.has(y)).sort((a, b) => a - b) };
}

/** hebcal's month numbers (Nisan = 1 ... Adar II = 13) as the site's month keys (Tishrei = 01; both Adars are 06). */
const MONTH_KEY: Record<number, string> = {
  [months.TISHREI]: '01',
  [months.CHESHVAN]: '02',
  [months.KISLEV]: '03',
  [months.TEVET]: '04',
  [months.SHVAT]: '05',
  [months.ADAR_I]: '06',
  [months.ADAR_II]: '06',
  [months.NISAN]: '07',
  [months.IYYAR]: '08',
  [months.SIVAN]: '09',
  [months.TAMUZ]: '10',
  [months.AV]: '11',
  [months.ELUL]: '12',
};

/** This month's key and the next one's, as MONTHS names them. */
export function currentMonths(today: Date): { now: string; next: string } {
  const now = MONTH_KEY[new HDate(today).getMonth()] ?? '01';
  const index = MONTHS.findIndex((m) => m.key === now);
  return { now, next: MONTHS[(index + 1) % MONTHS.length]!.key };
}

export { monthName } from './selection';
