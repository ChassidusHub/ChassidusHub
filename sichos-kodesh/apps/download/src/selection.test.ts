import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { DEFAULT_CUSTOM, axesOf, formatMb, monthTokens, monthsOf, sectionsParam } from './selection';

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
  });

  it('writes sizes the way people read them', () => {
    expect(formatMb(82.4 * 1024 * 1024)).toBe('82.4 MB');
    expect(formatMb(2.5 * 1024 ** 3)).toBe('2.50 GB');
  });
});
