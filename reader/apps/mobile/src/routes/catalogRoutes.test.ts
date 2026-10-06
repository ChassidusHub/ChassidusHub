import type { CatalogByYear, CatalogEntry } from '@chassidushub-reader/catalog';
import {
  groupEntriesByMonth,
  resolveOccasionRoute,
  resolveMonthOccasions,
  resolveOccasionAllYearsGroups,
} from './catalogRoutes';

function entry(overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'hebrewYear' | 'occasionId' | 'hebrewDate'>): CatalogEntry {
  return {
    hebrewYear: overrides.hebrewYear,
    occasionId: overrides.occasionId,
    hebrewDate: overrides.hebrewDate,
    occasionLabel: overrides.occasionLabel ?? `Occasion ${overrides.occasionId}`,
    audio: overrides.audio ?? [],
    pdfs: overrides.pdfs ?? [],
  };
}

describe('catalogRoutes', () => {
  const catalog: CatalogByYear = {
    5711: [
      entry({ hebrewYear: 5711, occasionId: 1, hebrewDate: '5711-05-10', audio: [{ workerFilename: 'a.mp3', durationMs: 1000 }] }),
      entry({ hebrewYear: 5711, occasionId: 2, hebrewDate: '5711-05-11', pdfs: [{ section: 'mugah', label: 'Mugah', driveFileId: 'm1' }] }),
      entry({ hebrewYear: 5711, occasionId: 3, hebrewDate: '5711-06A-01', pdfs: [{ section: 'biltiMugah', label: 'שיחו"ק ח"ב', driveFileId: 'h1' }] }),
      entry({ hebrewYear: 5711, occasionId: 4, hebrewDate: '5711-06A-05', pdfs: [{ section: 'maamorim', label: 'Maamar', driveFileId: 'mm1' }] }),
    ],
    5712: [
      entry({ hebrewYear: 5712, occasionId: 5, hebrewDate: '5712-05-10', audio: [{ workerFilename: 'b.mp3', durationMs: 1000 }] }),
    ],
  };

  it('groups consecutive entries by month token with localized month names', () => {
    const groups = groupEntriesByMonth(catalog[5711]!, 'en');

    expect(groups.map((group) => group.monthToken)).toEqual(['05', '06A']);
    expect(groups[0]?.entries.map((item) => item.occasionId)).toEqual([1, 2]);
    expect(groups[1]?.entries.map((item) => item.occasionId)).toEqual([3, 4]);
  });

  it('resolves follow routes back to the matching follow-month when the occasion is outside this week', () => {
    const resolved = resolveOccasionRoute(
      catalog,
      { kind: 'follow', sourceYear: 5711, occasionId: 1 },
      'en',
    );

    expect(resolved?.entry.occasionId).toBe(1);
    expect(resolved?.backRoute).toEqual({
      name: 'FollowMonthOccasions',
      params: { sourceYear: 5711, monthToken: '05' },
      backLabelKey: 'back',
    });
  });

  it('resolves browse routes back to the entry month when deep-linked outside this week', () => {
    const resolved = resolveOccasionRoute(
      catalog,
      { kind: 'browse', hebrewYear: 5711, occasionId: 4 },
      'en',
    );

    expect(resolved?.backRoute).toEqual({
      name: 'MonthOccasions',
      params: { hebrewYear: 5711, monthToken: '06A' },
      backLabelKey: 'back',
    });
  });

  it('filters month occasions by month token', () => {
    expect(resolveMonthOccasions(catalog, 5711, '05').map((item) => item.occasionId)).toEqual([1, 2]);
    expect(resolveMonthOccasions(catalog, 5711, '06A').map((item) => item.occasionId)).toEqual([3, 4]);
  });

  it('derives the same occasion across years from a source occasion', () => {
    const result = resolveOccasionAllYearsGroups(catalog, 5711, 1);

    expect(result.sourceEntry?.occasionId).toBe(1);
    expect(result.yearGroups.map((group) => [group.hebrewYear, group.matches.map((item) => item.occasionId)])).toEqual([
      [5711, [1]],
      [5712, [5]],
    ]);
  });
});
