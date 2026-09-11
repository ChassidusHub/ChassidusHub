import { buildFixedDateSchedule, buildWeeklySchedule, findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { describe, expect, it } from 'vitest';
import { STARTER_FIXED_OCCASIONS } from '../src/fixedOccasions.js';
import { toMafteiachHebrewDateKey } from '../src/hebrewDateKey.js';
import type { CatalogByYear } from '../src/catalogLookup.js';
import { resolveThisWeek } from '../src/resolveThisWeek.js';
import type { CatalogEntry } from '../src/types.js';

const IL = false;

function makeEntry(hebrewYear: number, hebrewDate: string, hasAudio: boolean): CatalogEntry {
  return {
    occasionId: 1,
    hebrewYear,
    hebrewDate,
    occasionLabel: 'test',
    audio: hasAudio ? [{ workerFilename: 'x.mp3', durationMs: 1000 }] : [],
    pdfs: [],
  };
}

describe('resolveThisWeek', () => {
  it("resolves this week's regular Shabbos occasion to the source year's matching recording", () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;
    const weekIndex = 5;

    const targetWeek = buildWeeklySchedule(targetYear, IL)[weekIndex]!;
    const sourceWeek = buildWeeklySchedule(sourceYear, IL)[weekIndex]!;
    const sourceKey = toMafteiachHebrewDateKey(sourceWeek.hebrewDate);

    const catalog: CatalogByYear = { [sourceYear]: [makeEntry(sourceYear, sourceKey, true)] };
    const today = new Date(`${targetWeek.gregorianDate}T00:00:00.000Z`);

    const result = resolveThisWeek(targetYear, sourceYear, IL, catalog, today);

    expect(result.resolution.status).toBe('primary');
    expect(result.resolution.resolvedYear).toBe(sourceYear);
    expect(result.entry?.audio).toHaveLength(1);
  });

  it('reports a gap (no crash) when neither the source year nor any fallback has a recording', () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;
    const today = new Date(`${buildWeeklySchedule(targetYear, IL)[5]!.gregorianDate}T00:00:00.000Z`);

    const result = resolveThisWeek(targetYear, sourceYear, IL, {}, today);

    expect(result.resolution.status).toBe('gap');
    expect(result.resolution.resolvedYear).toBeNull();
    expect(result.entry).toBeUndefined();
  });

  it('prioritizes an upcoming fixed-date occasion (within 7 days) over the regular weekly Shabbos', () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;
    const yudShevatDef = STARTER_FIXED_OCCASIONS.find((d) => d.key === 'yud-shevat')!;

    const targetYudShevat = buildFixedDateSchedule(targetYear, [yudShevatDef])[0]!;
    const sourceYudShevat = buildFixedDateSchedule(sourceYear, [yudShevatDef])[0]!;
    const sourceKey = toMafteiachHebrewDateKey(sourceYudShevat.hebrewDate);

    const catalog: CatalogByYear = { [sourceYear]: [makeEntry(sourceYear, sourceKey, true)] };
    // 3 days before Yud Shevat, still within the 7-day lookahead window.
    const today = new Date(new Date(`${targetYudShevat.gregorianDate}T00:00:00.000Z`).getTime() - 3 * 24 * 60 * 60 * 1000);

    const result = resolveThisWeek(targetYear, sourceYear, IL, catalog, today);

    expect(result.occasionKey).toBe('yud-shevat');
    expect(result.label).toBe('Yud Shevat');
    expect(result.resolution.status).toBe('primary');
  });
});
