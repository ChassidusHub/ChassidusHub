/**
 * Hebrew numerals as mafteiach.app writes them in its occasion labels, read
 * back into numbers: ו' (6), י"ג (13), ט"ו (15), and the Chabad spellings
 * that are not a plain letter sum - יו"ד (10, the letter's name, not
 * 10+6+4) and כ"ף (20) - next to the ones that are (ז"ך 27, טו"ב 17, ח"י
 * 18). Quotes must already be the ASCII ' and " (see
 * `normalizeHebrewPunctuation`).
 */

const LETTER_VALUES: Record<string, number> = {
  א: 1,
  ב: 2,
  ג: 3,
  ד: 4,
  ה: 5,
  ו: 6,
  ז: 7,
  ח: 8,
  ט: 9,
  י: 10,
  כ: 20,
  ך: 20,
  ל: 30,
  מ: 40,
  ם: 40,
  נ: 50,
  ן: 50,
  ס: 60,
  ע: 70,
  פ: 80,
  ף: 80,
  צ: 90,
  ץ: 90,
  ק: 100,
  ר: 200,
  ש: 300,
  ת: 400,
};

/** Letter names written out, whose value is the letter's own, not the sum of the name's letters. */
const SPELLED_OUT: Record<string, number> = {
  'יו"ד': 10,
  'כ"ף': 20,
};

/**
 * A regex source for one numeral token: a single letter with a geresh
 * (ו'), or letters with gershayim before the last one (י"ג, טו"ב). Only
 * the shape - `hebrewNumeralValue` decides whether it is a number.
 */
export const HEBREW_NUMERAL_SOURCE = `(?:[א-ת]'|[א-ת]{1,3}"[א-ת])`;

/** The value of one numeral token (`HEBREW_NUMERAL_SOURCE`'s shape), or null when it is not one. */
export function hebrewNumeralValue(token: string): number | null {
  const spelled = SPELLED_OUT[token];
  if (spelled !== undefined) return spelled;
  if (!new RegExp(`^${HEBREW_NUMERAL_SOURCE}$`).test(token)) return null;
  let sum = 0;
  for (const char of token.replace(/['"]/g, '')) {
    const value = LETTER_VALUES[char];
    if (value === undefined) return null;
    sum += value;
  }
  return sum;
}

/** A day of the month (1-30) written as a numeral token, or null. */
export function hebrewDayValue(token: string): number | null {
  const value = hebrewNumeralValue(token);
  return value !== null && value >= 1 && value <= 30 ? value : null;
}

/**
 * A year written without its thousands, as the labels do (תשכ"ח), as a
 * full Hebrew year (5728). Only the span a label can name - the Previous
 * Rebbe's years to the end of the catalog and a little beyond (5680-5799).
 */
export function hebrewYearValue(token: string): number | null {
  const value = hebrewNumeralValue(token);
  if (value === null || !token.startsWith('ת')) return null;
  const year = 5000 + value;
  return year >= 5680 && year <= 5799 ? year : null;
}

/**
 * Turns Hebrew and typographic quotes into the ASCII ' and " the labels
 * mostly use, and drops vowel points (a few labels carry some), so one set
 * of patterns reads every label.
 */
export function normalizeHebrewText(text: string): string {
  return text
    .replace(/[֑-ׇֽֿׁׂׅׄ]/g, '')
    .replace(/[׳‘’`´]/g, "'")
    .replace(/[״“”„]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function englishOrdinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
