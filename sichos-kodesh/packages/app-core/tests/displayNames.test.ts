import { describe, expect, it } from 'vitest';
import { audioChapterName, chapterTitle, occasionTitle, trackLabel } from '../src/catalog/displayNames.js';
import { hebrewDayMonthLabel, hebrewFullDateLabel } from '../src/catalog/formatHebrewDate.js';

const translated = { occasionLabel: `יום ב' דר"ה`, occasionLabelEn: 'Rosh Hashanah, day 2' };
const hebrewOnly = { occasionLabel: `תמוז, ר"ד לפני הנשים מוואסטער` };
const sicha = { chapterName: 'Sicha 1', chapterNameHe: 'שיחה א׳' };
const englishOnly = { chapterName: 'Vayanchem' };
const unnamed = {};

describe('occasionTitle', () => {
  it('shows the English UI the English name, and the Hebrew UI the Hebrew label', () => {
    expect(occasionTitle(translated, 'en')).toBe('Rosh Hashanah, day 2');
    expect(occasionTitle(translated, 'he')).toBe(`יום ב' דר"ה`);
  });

  it('falls back to the Hebrew label where there is no English (or a catalog from before 1.1.0)', () => {
    expect(occasionTitle(hebrewOnly, 'en')).toBe(hebrewOnly.occasionLabel);
  });
});

describe('audioChapterName / chapterTitle', () => {
  it('shows the Hebrew UI the Hebrew name, and the English UI JEM\'s own', () => {
    expect(audioChapterName(sicha, 'he')).toBe('שיחה א׳');
    expect(audioChapterName(sicha, 'en')).toBe('Sicha 1');
    expect(chapterTitle(sicha, 0, 'he')).toBe('שיחה א׳');
  });

  it("falls back to JEM's English, then to the track number", () => {
    expect(audioChapterName(englishOnly, 'he')).toBe('Vayanchem');
    expect(audioChapterName(unnamed, 'he')).toBeUndefined();
    expect(chapterTitle(unnamed, 2, 'he')).toBe('קטע 3');
    expect(chapterTitle(unnamed, 2, 'en')).toBe('Track 3');
    expect(chapterTitle(unnamed, 0, 'en', (n) => `#${n}`)).toBe('#1');
  });

  it("uses the apps' own track words", () => {
    expect(trackLabel(4, 'en')).toBe('Track 4');
    expect(trackLabel(4, 'he')).toBe('קטע 4');
  });
});

describe('Hebrew dates', () => {
  it('shows a full date, and what a partial one has', () => {
    expect(hebrewFullDateLabel('5736-06A-06', 5736, 'en')).toBe('6 Adar I 5736');
    expect(hebrewFullDateLabel('5736-05-10', 5736, 'he')).toBe('י׳ שבט תשל״ו');
    // A library item with only a month, or with no date at all, never throws.
    expect(hebrewFullDateLabel('5736-05', 5736, 'he')).toBe('שבט תשל״ו');
    expect(hebrewFullDateLabel('', 5736, 'he')).toBe('תשל״ו');
    expect(hebrewFullDateLabel('', 0, 'en')).toBe('');
    expect(hebrewDayMonthLabel('', 'he')).toBe('');
  });
});
