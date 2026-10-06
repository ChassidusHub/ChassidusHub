import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { DEFAULT_CUSTOM, axesOf, collectionInfo, countItems, formatMb, groupName, monthTokens, monthsOf, profileInfo, sectionsParam, yearLabel } from './selection';

describe('the download site', () => {
  it('asks the pack API for exactly the content chosen', () => {
    expect(sectionsParam({ preset: 'everything', custom: DEFAULT_CUSTOM })).toBe('everything');
    expect(sectionsParam({ preset: 'custom', custom: { ...DEFAULT_CUSTOM, torasMenachem: true } })).toBe('audio,biltiMugah:sichosKodesh+torasMenachem,mugah');
    expect(sectionsParam({ preset: 'custom', custom: { audio: false, sichosKodesh: false, torasMenachem: false, mugah: false, maamorim: false, hagahos: false, hosofos: false } })).toBeNull();
  });

  it("takes Adar as the year has it", () => {
    expect(monthTokens(5736, '06')).toEqual(['06A', '06B']);
    expect(monthTokens(5737, '06')).toEqual(['06']);
    expect(monthTokens(5737, '01')).toEqual(['01']);
  });

  it('lists only months that have farbrengens, Tishrei first, with Hebrew names', () => {
    const entry = (hebrewDate: string) => ({ hebrewDate, occasionId: 1, hebrewYear: 5746, occasionLabel: '', audio: [], pdfs: [] }) as CatalogEntry;
    expect(monthsOf([entry('5746-07-11'), entry('5746-01-13'), entry('5746-06A-14'), entry('5746-06B-14'), entry('5746-07-13')])).toEqual([
      { token: '01', name: 'תשרי', occasions: 1 },
      { token: '06', name: 'אדר', occasions: 2 },
      { token: '07', name: 'ניסן', occasions: 2 },
    ]);
  });

  it('offers the axes the app browses by, in its order, and only those a collection has', () => {
    expect(axesOf({ moad: [{}], volume: [{}], parsha: [], unknown: [{}] }).map((a) => a.id)).toEqual(['volume', 'moad']);
    expect(axesOf({ moad: [{}], volume: [{}] }, 'en').map((a) => a.name)).toEqual(['By volume', 'By moed']);
  });

  it('counts a month across several years: the kvius years picked', () => {
    const entry = (hebrewYear: number, hebrewDate: string) => ({ hebrewDate, occasionId: 1, hebrewYear, occasionLabel: '', audio: [], pdfs: [] }) as CatalogEntry;
    const years = [[entry(5736, '5736-01-13'), entry(5736, '5736-06A-14')], [entry(5764, '5764-01-20'), entry(5764, '5764-06B-14'), entry(5764, '5764-05-10')]];
    expect(monthsOf(years.flat())).toEqual([
      { token: '01', name: 'תשרי', occasions: 2 },
      { token: '05', name: 'שבט', occasions: 1 },
      { token: '06', name: 'אדר', occasions: 2 },
    ]);
  });

  it('says it all in English too', () => {
    const entry = (hebrewDate: string) => ({ hebrewDate, occasionId: 1, hebrewYear: 5746, occasionLabel: '', audio: [], pdfs: [] }) as CatalogEntry;
    expect(monthsOf([entry('5746-11-20'), entry('5746-02-01')], 'en').map((m) => m.name)).toEqual(['Cheshvan', 'Menachem Av']);
    expect(yearLabel(5736, 'en')).toBe('5736');
    expect(yearLabel(5736)).toBe('תשל״ו');
    expect(countItems(collectionInfo('likkuteiSichos', 'en'), 1, 'en')).toBe('1 sicha');
    expect(countItems(collectionInfo('likkuteiSichos', 'en'), 3200, 'en')).toBe('3,200 sichos');
    expect(countItems(collectionInfo('likkuteiSichos'), 1, 'he')).toBe('שיחה אחת');
    expect(profileInfo('src', 'en').name).toBe('The original file');
    expect(groupName('maamorim', 'year', { slug: '5711', name: 'תשי״א' }, 'en')).toBe('5711');
    expect(groupName('maamorim', 'melukat', { slug: '2', name: 'ב' }, 'he')).toBe('מלוקט ח״ב');
  });

  it('writes sizes the way people read them', () => {
    expect(formatMb(82.4 * 1024 * 1024)).toBe('82.4 MB');
    expect(formatMb(2.5 * 1024 ** 3)).toBe('2.50 GB');
  });
});
