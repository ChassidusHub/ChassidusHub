import { HDate, Sedra, getSedra, months } from '@hebcal/core';
import type { KviusSignature, WeekdayCode, YearType } from './types.js';

/**
 * Computes the kviah (see {@link KviusSignature}) of a Hebrew year directly
 * from calendar arithmetic — no lookup table, so it is correct for any
 * year in HDate's supported range without needing the traditional list of
 * "14 keviyot" to be transcribed by hand.
 */
export function kviusSignature(hebrewYear: number): KviusSignature {
  const leap = HDate.isLeapYear(hebrewYear);
  const yearLength = HDate.daysInYear(hebrewYear);
  const roshHashanaDow = new HDate(1, months.TISHREI, hebrewYear).getDay() as WeekdayCode;
  const base = leap ? 383 : 353;
  const offset = yearLength - base;
  const yearType = yearTypeFromOffset(offset, hebrewYear, yearLength);
  return { leap, roshHashanaDow, yearLength, yearType };
}

function yearTypeFromOffset(offset: number, hebrewYear: number, yearLength: number): YearType {
  switch (offset) {
    case 0:
      return 'chaser';
    case 1:
      return 'kesidran';
    case 2:
      return 'shalem';
    default:
      throw new RangeError(`Unexpected year length ${yearLength} for Hebrew year ${hebrewYear}`);
  }
}

/** Two years are kvius-matched iff leap status, Rosh Hashana weekday and year-length class all agree. */
export function sameKvius(a: KviusSignature, b: KviusSignature): boolean {
  return a.leap === b.leap && a.roshHashanaDow === b.roshHashanaDow && a.yearType === b.yearType;
}

const DOW_LETTER: Partial<Record<WeekdayCode, string>> = { 0: 'א', 1: 'ב', 2: 'ג', 4: 'ה', 6: 'ז' };
const YEAR_TYPE_LETTER: Record<YearType, string> = { chaser: 'ח', kesidran: 'כ', shalem: 'ש' };

function dowLetter(dow: WeekdayCode): string {
  const letter = DOW_LETTER[dow];
  if (!letter) {
    throw new RangeError(
      `Day of week ${dow} can never host Rosh Hashana or the first day of Pesach (the "lo adu rosh" / "lo badu Pesach" postponement rules forbid it)`,
    );
  }
  return letter;
}

/**
 * The traditional 3-letter Hebrew mnemonic for a year's kviah, e.g. "בשה":
 * Rosh Hashana weekday, year-length class, weekday of the first day of
 * Pesach. Two years share a kvius code iff their {@link kviusSignature}
 * matches — the Pesach letter is a derived checksum, not extra
 * information, but it's the form printed on kvius charts (e.g.
 * berel.me/kvius) so it's worth exposing for display purposes.
 */
export function kviusCode(hebrewYear: number): string {
  const sig = kviusSignature(hebrewYear);
  const pesachDow = new HDate(15, months.NISAN, hebrewYear).getDay() as WeekdayCode;
  return `${dowLetter(sig.roshHashanaDow)}${YEAR_TYPE_LETTER[sig.yearType]}${dowLetter(pesachDow)}`;
}

/** Thin wrapper so callers only ever import Sedra access through this module. */
export function getYearSedra(hebrewYear: number, il: boolean): Sedra {
  return getSedra(hebrewYear, il);
}

/**
 * Formats a kvius signature into a clean human-readable summary,
 * e.g. "Regular · Kesidran (354 days)" or "Leap · Shalem (385 days)".
 */
export function formatKviusSignature(sig: KviusSignature): string {
  const leapText = sig.leap ? 'Leap' : 'Regular';
  const typeText = sig.yearType.charAt(0).toUpperCase() + sig.yearType.slice(1);
  return `${leapText} · ${typeText} (${sig.yearLength} days)`;
}

