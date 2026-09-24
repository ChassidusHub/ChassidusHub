import { describe, expect, it } from 'vitest';
import { audioChapterName, chapterTitle, occasionTitle, trackLabel } from '../src/catalog/displayNames.js';

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
