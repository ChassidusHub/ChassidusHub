import { ESSENTIAL_CONTENT_TYPES } from '@chassidushub-reader/app-core';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { describe, expect, it } from 'vitest';
import { entriesInScope, parseScope, parseSections } from '../src/scope.js';

describe('parseScope', () => {
  it('reads a month, with English and Hebrew labels and a file-name slug', () => {
    expect(parseScope('5736-01')).toEqual({
      year: 5736,
      month: '01',
      slug: '5736-01-tishrei',
      scope: { kind: 'month', collection: 'farbrengens', hebrewYear: 5736, month: '01', label: { en: 'Tishrei 5736', he: 'תשרי תשל״ו' } },
    });
    expect(parseScope('5746-06B').slug).toBe('5746-06B-adar-ii');
    expect(parseScope('5746-06B').scope.label).toEqual({ en: 'Adar II 5746', he: 'אדר ב׳ תשמ״ו' });
  });

  it('reads a year, and refuses anything else', () => {
    expect(parseScope('5736')).toEqual({ year: 5736, slug: '5736', scope: { kind: 'year', collection: 'farbrengens', hebrewYear: 5736, label: { en: '5736', he: 'תשל״ו' } } });
    expect(() => parseScope('5736-13')).toThrow('scope must be');
    expect(() => parseScope('tishrei')).toThrow('scope must be');
  });

  it('picks the entries of the month out of the year', () => {
    const entry = (occasionId: number, hebrewDate: string): CatalogEntry => ({ occasionId, hebrewYear: 5736, hebrewDate, occasionLabel: '', audio: [], pdfs: [] });
    const year = [entry(1, '5736-01-02'), entry(2, '5736-01-13b'), entry(3, '5736-02-01')];
    expect(entriesInScope(year, parseScope('5736-01')).map((e) => e.occasionId)).toEqual([1, 2]);
    expect(entriesInScope(year, parseScope('5736')).map((e) => e.occasionId)).toEqual([1, 2, 3]);
  });
});

describe('parseSections', () => {
  it('takes the app presets and single sections', () => {
    expect(parseSections('essentials')).toEqual(ESSENTIAL_CONTENT_TYPES);
    expect(parseSections('audio,biltiMugah:sichosKodesh,mugah')).toEqual({ audio: true, hanachaEditions: ['sichosKodesh'], mugah: true, maamorim: false, hagahos: false, hosofos: false });
    expect(parseSections('biltiMugah').hanachaEditions).toEqual(['sichosKodesh', 'sefer', 'torasMenachem']);
    expect(parseSections('biltiMugah:torasMenachem+sichosKodesh, hagahos')).toMatchObject({ hanachaEditions: ['torasMenachem', 'sichosKodesh'], hagahos: true, audio: false });
  });

  it('refuses what it does not know, and an empty selection', () => {
    expect(() => parseSections('video')).toThrow('unknown section "video"');
    expect(() => parseSections('biltiMugah:english')).toThrow('unknown hanacha edition "english"');
    expect(() => parseSections(' , ')).toThrow('selects nothing');
  });
});
