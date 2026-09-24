import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { DEFAULT_CUSTOM, formatMb, monthsOf, scopeParam, sectionsParam, selectionQuery } from './selection';

describe('the download site', () => {
  it('asks the pack API for exactly what was chosen', () => {
    expect(scopeParam({ year: 5736, month: '01' })).toBe('5736-01');
    expect(scopeParam({ year: 5736, month: null })).toBe('5736');
    expect(sectionsParam({ preset: 'everything', custom: DEFAULT_CUSTOM })).toBe('everything');
    expect(sectionsParam({ preset: 'custom', custom: { ...DEFAULT_CUSTOM, torasMenachem: true } })).toBe('audio,biltiMugah:sichosKodesh+torasMenachem,mugah');
    expect(sectionsParam({ preset: 'custom', custom: { audio: false, sichosKodesh: false, torasMenachem: false, mugah: false, maamorim: false, hagahos: false, hosofos: false } })).toBeNull();
    expect(selectionQuery({ year: 5736, month: '06A', preset: 'essentials', custom: DEFAULT_CUSTOM, profile: 'opus24', maxMb: 500 })).toBe('scope=5736-06A&profile=opus24&sections=essentials&maxMb=500');
  });

  it('lists only months that have farbrengens, Tishrei first, with Hebrew names', () => {
    const entry = (hebrewDate: string) => ({ hebrewDate, occasionId: 1, hebrewYear: 5746, occasionLabel: '', audio: [], pdfs: [] }) as CatalogEntry;
    expect(monthsOf([entry('5746-07-11'), entry('5746-01-13'), entry('5746-06A-14'), entry('5746-07-13')])).toEqual([
      { token: '01', name: 'תשרי', occasions: 1 },
      { token: '06A', name: 'אדר א׳', occasions: 1 },
      { token: '07', name: 'ניסן', occasions: 2 },
    ]);
  });

  it('writes sizes the way people read them', () => {
    expect(formatMb(82.4 * 1024 * 1024)).toBe('82.4 MB');
    expect(formatMb(2.5 * 1024 ** 3)).toBe('2.50 GB');
  });
});
