import { describe, expect, it } from 'vitest';
import type { CatalogByYear, CatalogEntry, CatalogPdf } from '@chassidushub-reader/catalog';
import { farbrengenTexts, neighborOccasions, occasionMarks, occasionWeekday, preferredHanachaEdition } from '../src/catalog/farbrengenPage.js';

const pdf = (section: CatalogPdf['section'], label: string): CatalogPdf => ({ section, label, driveFileId: label });
const entry = (hebrewYear: number, occasionId: number, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  hebrewYear,
  occasionId,
  hebrewDate: `${hebrewYear}-01-13`,
  occasionLabel: `occasion ${occasionId}`,
  audio: [{ workerFilename: `${occasionId}.mp3`, durationMs: 1000 }],
  pdfs: [],
  ...extra,
});

describe('a farbrengen page', () => {
  const tm = pdf('biltiMugah', 'תו"מ חלק ג');
  const sk = pdf('biltiMugah', 'שיחו"ק תשל"ו');
  const other = pdf('biltiMugah', 'קובץ מכתבים');
  const mugah = pdf('mugah', 'לקו"ש חט"ו');
  const hagahos = pdf('hagahos', 'צילום 1');
  const farbrengen = entry(5736, 1, { pdfs: [hagahos, sk, other, mugah, tm] });

  it('puts its hanachos first, the preferred edition before the other, and every other text by section in order', () => {
    const texts = farbrengenTexts(farbrengen, 'torasMenachem');
    expect(texts.hanachos.map((p) => p.label)).toEqual([tm.label, sk.label]);
    expect(texts.groups.map((g) => [g.section, g.pdfs.map((p) => p.label)])).toEqual([
      ['mugah', [mugah.label]],
      ['biltiMugah', [other.label]],
      ['hagahos', [hagahos.label]],
    ]);
    expect(farbrengenTexts(farbrengen, null).hanachos.map((p) => p.label)).toEqual([sk.label, tm.label]);
  });

  it('prefers an edition only when the listener keeps just one', () => {
    expect(preferredHanachaEdition(['torasMenachem'])).toBe('torasMenachem');
    expect(preferredHanachaEdition(['sichosKodesh', 'torasMenachem'])).toBeNull();
    expect(preferredHanachaEdition([])).toBeNull();
  });

  it('marks what it has', () => {
    expect(occasionMarks({ ...farbrengen, audio: [{ workerFilename: 'a', durationMs: 60_000 }, { workerFilename: 'b', durationMs: 30_000 }] })).toEqual({ durationMs: 90_000, chapters: 2, hanacha: true, mugah: true });
    expect(occasionMarks(entry(5736, 2, { audio: [] }))).toEqual({ durationMs: 0, chapters: 0, hanacha: false, mugah: false });
  });

  it('knows the farbrengens around it, across the years and past the empty ones', () => {
    const empty = entry(5736, 3, { audio: [] });
    const catalog: CatalogByYear = { 5735: [entry(5735, 10), entry(5735, 11)], 5736: [entry(5736, 1), empty, entry(5736, 2)], 5737: [], 5738: [entry(5738, 20)] };
    expect(neighborOccasions(catalog, 5736, 1)).toMatchObject({ previous: { occasionId: 11 }, next: { occasionId: 2 } });
    expect(neighborOccasions(catalog, 5736, 2)).toMatchObject({ previous: { occasionId: 1 }, next: { occasionId: 20 } });
    expect(neighborOccasions(catalog, 5735, 10).previous).toBeNull();
    expect(neighborOccasions(catalog, 5738, 20).next).toBeNull();
    expect(neighborOccasions(catalog, 5736, 99)).toEqual({ previous: null, next: null });
  });

  it('names the day of the week it fell on', () => {
    // 10 Shevat 5711 was a Wednesday (17 January 1951); 15 Tishrei 5736 a Shabbos (20 September 1975).
    expect(occasionWeekday('5711-05-10', 'en')).toBe('Wednesday');
    expect(occasionWeekday('5711-05-10', 'he')).toBe('יום רביעי');
    expect(occasionWeekday('5736-01-15', 'en')).toBe('Shabbos');
    expect(occasionWeekday('5736-01-15', 'he')).toBe('שבת קודש');
    expect(occasionWeekday('5736-05', 'en')).toBeNull();
  });
});
