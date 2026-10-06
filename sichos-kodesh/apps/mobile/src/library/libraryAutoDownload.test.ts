import { HDate, parshiot } from '@hebcal/core';

const { catalogStore } = require('../catalog/catalogStore') as typeof import('../catalog/catalogStore');
const auto = require('./libraryAutoDownload') as typeof import('./libraryAutoDownload');
const settings = require('../download/downloadSettings') as typeof import('../download/downloadSettings');

const library = () => catalogStore.getLibrary()!;
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

describe('library auto-download', () => {
  it('finds every one of the 54 parshiyos among Likkutei Sichos\' groups, by place', () => {
    const groups = library().collections.likkuteiSichos.groups.parsha!;
    expect(groups).toHaveLength(parshiot.length);
    // Spot checks where the spellings differ.
    expect(auto.lsParshaSlugs(library(), ['Vayera'])).toEqual(['vayeira']);
    expect(auto.lsParshaSlugs(library(), ["Sh'lach"])).toEqual(['shlach']);
    expect(auto.lsParshaSlugs(library(), ['Vayakhel', 'Pekudei'])).toEqual(['vayakhel', 'pekudei']);
    expect(auto.lsParshaSlugs(library(), null)).toEqual([]);
    // Same first letters all the way down: the two lists are in the same order.
    for (let i = 0; i < groups.length; i += 1) expect(normalize(groups[i]!.slug)[0]).toBe(normalize(parshiot[i]!)[0]);
  });

  it('maps every month to a general-letters moed that exists', () => {
    const moadim = new Set(library().collections.michtavimKlolim.groups.moed!.map((group) => group.slug));
    for (const token of ['01', '02', '03', '04', '05', '06', '06A', '06B', '07', '08', '09', '10', '11', '12']) {
      expect(moadim.has(auto.michtavMoedSlug(token)!)).toBe(true);
    }
  });

  it('downloads nothing until a collection is turned on', () => {
    expect(auto.resolveLibraryAutoTargets(library(), {}, [5736], new Date('2026-09-24T12:00:00Z'))).toEqual([]);
  });

  it('keeps this month of the source year ready, as library targets', () => {
    const today = new Date('2026-09-24T12:00:00Z'); // Tishrei
    expect(new HDate(today).getMonth()).toBe(7);
    const targets = auto.resolveLibraryAutoTargets(library(), { maamorim: true, michtavimKlolim: true, likkuteiSichos: true }, [5736], today);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((target) => target.key.startsWith('lib:'))).toBe(true);
    const maamarKeys = targets.filter((target) => target.key.startsWith('lib:maamorim:'));
    for (const target of maamarKeys) expect(target.hebrewYear).toBe(5736);
  });

  it('reads the setting from what an older version stored, and keeps only switches', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('sichos-kodesh:mobile-download-settings', JSON.stringify({ autoDownloadEnabled: true }));
    expect((await settings.readStoredDownloadSettings()).libraryAutoDownload).toEqual({});
    await AsyncStorage.setItem('sichos-kodesh:mobile-download-settings', JSON.stringify({ libraryAutoDownload: { maamorim: true, yomanim: 'yes' } }));
    expect((await settings.readStoredDownloadSettings()).libraryAutoDownload).toEqual({ maamorim: true });
  });
});
