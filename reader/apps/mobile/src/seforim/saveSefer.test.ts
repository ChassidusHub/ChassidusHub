import type { CatalogWork, CatalogWorkContents } from '@chassidushub-reader/catalog';
import type { PacksNativeModule } from '../offline/packsNative';

// A small file system in memory, for react-native-blob-util's `fs`.
const mockFiles = new Map<string, string>();
jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/docs' },
    exists: jest.fn(async (path: string) => mockFiles.has(path) || [...mockFiles.keys()].some((f) => f.startsWith(`${path}/`))),
    mkdir: jest.fn(async () => undefined),
    writeFile: jest.fn(async (path: string, data: string) => {
      mockFiles.set(path, data);
    }),
    appendFile: jest.fn(async (path: string, data: string) => {
      mockFiles.set(path, (mockFiles.get(path) ?? '') + data);
    }),
    readFile: jest.fn(async (path: string) => {
      const data = mockFiles.get(path);
      if (data === undefined) throw new Error(`no file ${path}`);
      return data;
    }),
    stat: jest.fn(async (path: string) => ({ size: String((mockFiles.get(path) ?? '').length) })),
    unlink: jest.fn(async (path: string) => {
      for (const file of [...mockFiles.keys()]) if (file === path || file.startsWith(`${path}/`)) mockFiles.delete(file);
    }),
    mv: jest.fn(async (from: string, to: string) => {
      mockFiles.set(to, mockFiles.get(from)!);
      mockFiles.delete(from);
    }),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const { resetSavedState, getSavedState, savedTextPath } = require('./savedStore') as typeof import('./savedStore');
const { saveSefer, removeSavedSefer, getSaveJob, resetSaveJobs, saveParts } = require('./saveSefer') as typeof import('./saveSefer');
const { loadUnitText } = require('./seforimText') as typeof import('./seforimText');
const { heldSearchIndexes } = require('./seforimSearch') as typeof import('./seforimSearch');

// An invented sefer in the catalog's shape - not a real edition.
const work: CatalogWork = {
  id: 'tanya',
  title: { he: 'תניא', en: 'Tanya' },
  authors: ['alter-rebbe'],
  genre: 'chassidus',
  levels: [],
  sources: [
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', rights: 'ship-with-credit', credit: 'Kehot', version: 'Kehot Publication Society' },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'unknown', rights: 'link-only', version: 'Other' },
  ],
  units: 3,
};
const contents: CatalogWorkContents = {
  workId: 'tanya',
  contents: [{ unitId: 'part1/1' }, { unitId: 'part1/2' }, { unitId: 'part1/3' }],
  units: [1, 2, 3].map((n) => ({ id: `part1/${n}`, label: `פרק ${n}`, labelEn: `Chapter ${n}`, ref: `Tanya ${n}`, editions: [{ source: 0, bytes: 10 }, { source: 1 }] })),
};

const texts: Record<string, string> = { 'Tanya 1': 'וְהַבֵּינוֹנִי הוּא', 'Tanya 2': 'שְׁכִינָה', 'Tanya 3': 'אַהֲבָה' };
function sefaria(failFrom = Infinity) {
  let calls = 0;
  const fetchFn = jest.fn(async (url: string) => {
    calls += 1;
    if (calls >= failFrom) throw new Error('network');
    const ref = decodeURIComponent(/texts\/([^?]+)/.exec(url)![1]!).replace(/_/g, ' ');
    return { ok: true, json: async () => ({ versions: [{ text: [texts[ref] ?? ''] }] }), text: async (): Promise<string> => '' };
  });
  return fetchFn;
}

function fakeNative() {
  const built: Array<{ rows: Array<{ unit: string; source: number; title: string; body: string }>; dest: string; meta: Record<string, string> }> = [];
  const native = {
    buildSearchIndex: jest.fn(async (rowsFile: string, dest: string, _sql: readonly string[], meta: Record<string, string>) => {
      const rows = (mockFiles.get(`/docs/${rowsFile}`) ?? '').split('\n').filter(Boolean).map((line) => JSON.parse(line));
      mockFiles.delete(`/docs/${rowsFile}`);
      mockFiles.set(`/docs/${dest}`, 'sqlite');
      built.push({ rows, dest, meta });
      return rows.length;
    }),
  } as unknown as PacksNativeModule;
  return { native, built };
}

describe('saving a sefer on the phone', () => {
  beforeEach(() => {
    mockFiles.clear();
    resetSavedState();
    resetSaveJobs();
  });

  it('saves every edition that may be read, builds its index, and reads it back with no connection', async () => {
    const { native, built } = fakeNative();
    const fetchFn = sefaria();
    expect(saveParts(work, contents)).toHaveLength(3);
    await saveSefer(native, work, contents, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(getSaveJob('tanya')).toBeUndefined();
    const saved = (await getSavedState()).seforim.tanya!;
    expect(saved).toMatchObject({ units: 3, complete: true, index: 'indexes/saved_tanya.sqlite' });
    expect(mockFiles.has(`/docs/${savedTextPath('tanya', 'part1/1', 0)}`)).toBe(true);

    // The rows are the pack builder's: the unit, its edition, the normalised title and the words with their stems.
    expect(built[0]!.meta).toMatchObject({ format: '1', work: 'tanya' });
    expect(built[0]!.rows.map((r) => [r.unit, r.source, r.title])).toEqual([
      ['part1/1', 0, 'פרק 1'],
      ['part1/2', 0, 'פרק 2'],
      ['part1/3', 0, 'פרק 3'],
    ]);
    expect(built[0]!.rows[0]!.body.split(' ')).toEqual(expect.arrayContaining(['והבינוני', 'הבינוני', 'בינוני']));

    const offline = await loadUnitText(work, contents.units[1]!, contents.units[1]!.editions[0]!, false);
    expect(offline.from).toBe('phone');
    expect(offline.html).toContain('שְׁכִינָה');
    expect((await heldSearchIndexes()).get('tanya')).toBe('indexes/saved_tanya.sqlite');
  });

  it('stops when the connection goes, keeps what it saved, and continues from there', async () => {
    const { native, built } = fakeNative();
    // One worker at a time would stop after two; three run at once, so the failure lands on the third call.
    await saveSefer(native, work, contents, sefaria(3));
    expect(getSaveJob('tanya')).toMatchObject({ state: 'stopped', problem: 'offline', done: 2, total: 3 });
    expect((await getSavedState()).seforim.tanya).toMatchObject({ units: 2, complete: false, index: null });
    expect(built).toHaveLength(0);

    const again = sefaria();
    await saveSefer(native, work, contents, again);
    expect(again).toHaveBeenCalledTimes(1);
    expect((await getSavedState()).seforim.tanya).toMatchObject({ units: 3, complete: true });
  });

  it('leaves out a unit Sefaria does not serve, indexes the rest, and tries it again on continue', async () => {
    const { native, built } = fakeNative();
    const missing = jest.fn(async (url: string) => (url.includes('Tanya_2') ? { ok: false, json: async () => ({}), text: async (): Promise<string> => '' } : sefaria()(url)));
    await saveSefer(native, work, contents, missing);
    expect(getSaveJob('tanya')).toMatchObject({ state: 'stopped', problem: 'unavailable', done: 2, total: 3 });
    expect((await getSavedState()).seforim.tanya).toMatchObject({ units: 2, complete: false, index: 'indexes/saved_tanya.sqlite' });
    expect(built[0]!.rows.map((r) => r.unit)).toEqual(['part1/1', 'part1/3']);

    const again = sefaria();
    await saveSefer(native, work, contents, again);
    expect(again).toHaveBeenCalledTimes(1);
    expect((await getSavedState()).seforim.tanya).toMatchObject({ units: 3, complete: true });
    expect(getSaveJob('tanya')).toBeUndefined();
  });

  it('writes no text in place until it is whole', async () => {
    const { native } = fakeNative();
    await saveSefer(native, work, contents, sefaria());
    expect([...mockFiles.keys()].filter((f) => f.endsWith('.part'))).toEqual([]);
  });

  it('removes a saved sefer: its texts, its index and its record', async () => {
    const { native } = fakeNative();
    await saveSefer(native, work, contents, sefaria());
    await removeSavedSefer('tanya');
    expect([...mockFiles.keys()].filter((f) => f.includes('saved'))).toEqual([]);
    expect((await getSavedState()).seforim.tanya).toBeUndefined();
    await expect(loadUnitText(work, contents.units[0]!, contents.units[0]!.editions[0]!, false)).rejects.toMatchObject({ problem: 'offline' });
  });
});
