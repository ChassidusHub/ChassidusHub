import { describe, expect, it } from 'vitest';
import { englishOrdinal, hebrewDayValue, hebrewNumeralValue, hebrewYearValue, normalizeHebrewText } from '../src/translate/hebrewNumerals.js';

describe('hebrewNumeralValue', () => {
  it('reads a letter with a geresh and letters with gershayim', () => {
    expect(hebrewNumeralValue("ו'")).toBe(6);
    expect(hebrewNumeralValue('י"ג')).toBe(13);
    expect(hebrewNumeralValue('ט"ו')).toBe(15);
    expect(hebrewNumeralValue('כ"ט')).toBe(29);
  });

  it('reads the Chabad spellings: the letter names יו"ד and כ"ף, and ז"ך / טו"ב / ח"י', () => {
    expect(hebrewNumeralValue('יו"ד')).toBe(10);
    expect(hebrewNumeralValue('כ"ף')).toBe(20);
    expect(hebrewNumeralValue('ז"ך')).toBe(27);
    expect(hebrewNumeralValue('טו"ב')).toBe(17);
    expect(hebrewNumeralValue('ח"י')).toBe(18);
  });

  it('rejects what is not a numeral token', () => {
    expect(hebrewNumeralValue('תשרי')).toBeNull();
    expect(hebrewNumeralValue('ו')).toBeNull();
    expect(hebrewNumeralValue('')).toBeNull();
  });
});

describe('hebrewDayValue / hebrewYearValue', () => {
  it('accepts a day of the month only from 1 to 30', () => {
    expect(hebrewDayValue('ל\'')).toBe(30);
    expect(hebrewDayValue('ל"א')).toBeNull();
    expect(hebrewDayValue('ר"ה')).toBeNull();
  });

  it('reads a year without its thousands, within the span a label can name', () => {
    expect(hebrewYearValue('תשכ"ח')).toBe(5728);
    expect(hebrewYearValue('תש"נ')).toBe(5750);
    expect(hebrewYearValue('ש"ת')).toBeNull();
    expect(hebrewYearValue('ת"ק')).toBeNull();
  });
});

describe('normalizeHebrewText', () => {
  it('turns Hebrew and typographic quotes into ASCII, drops vowel points and extra spaces', () => {
    expect(normalizeHebrewText('  י״א  ניסן ')).toBe('י"א ניסן');
    expect(normalizeHebrewText('ב׳ כסלו')).toBe("ב' כסלו");
    expect(normalizeHebrewText('מאָסקוואַ')).toBe('מאסקווא');
  });
});

describe('englishOrdinal', () => {
  it('writes 1st, 2nd, 3rd, 4th, 11th, 22nd', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 22].map(englishOrdinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '22nd']);
  });
});
