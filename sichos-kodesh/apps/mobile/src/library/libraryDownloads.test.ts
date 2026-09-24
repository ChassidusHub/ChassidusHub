const mockUnlink = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/docs' },
    exists: jest.fn(() => Promise.resolve(true)),
    ls: jest.fn(() => Promise.resolve([])),
    stat: jest.fn(() => Promise.resolve({ size: '0' })),
    unlink: mockUnlink,
  },
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { catalogStore } = require('../catalog/catalogStore') as typeof import('../catalog/catalogStore');
const downloads = require('./libraryDownloads') as typeof import('./libraryDownloads');
const downloadStorage = require('../download/downloadStorage') as typeof import('../download/downloadStorage');

const library = () => catalogStore.getLibrary()!;

describe('library downloads', () => {
  beforeEach(async () => {
    mockUnlink.mockClear();
    await AsyncStorage.clear();
  });

  it('keys each file by collection and item, even when the item id holds a colon', () => {
    const sicha = library().collections.likkuteiSichos.items.find((item) => item.id.includes(':'))!;
    const [target] = downloads.libraryItemTargets('likkuteiSichos', sicha);
    expect(target!.key.startsWith('lib:likkuteiSichos:')).toBe(true);
    expect(downloads.parseLibraryTargetKey(target!.key)).toEqual({ collection: 'likkuteiSichos', itemId: sicha.id });
    expect(downloads.parseLibraryTargetKey('audio:5736:1:0:JEMSK0562A.mp3')).toBeNull();
    expect(target!.occasionId).toBeLessThan(0);
  });

  it('numbers an item\'s recordings as chapters, and its PDFs by Drive id', () => {
    const event = library().collections.jemEvents.items.find((item) => item.refs.filter((ref) => ref.kind === 'audio').length > 1)!;
    const targets = downloads.libraryItemTargets('jemEvents', event);
    expect(targets.map((target) => target.chapterIndex)).toEqual(targets.map((_, index) => index));
    expect(targets.every((target) => target.workerFilename)).toBe(true);
  });

  it('lists an item as downloaded only when every file is here', () => {
    const sicha = library().collections.likkuteiSichos.items.find((item) => item.refs.length > 1)!;
    const names = downloads.libraryItemTargets('likkuteiSichos', sicha).map(downloadStorage.fileNameForTarget);
    const some = downloads.downloadedLibraryItems(library(), new Set(names.slice(0, 1)));
    expect(some.some((d) => d.item.id === sicha.id)).toBe(false);
    const all = downloads.downloadedLibraryItems(library(), new Set(names));
    expect(all.some((d) => d.collection === 'likkuteiSichos' && d.item.id === sicha.id)).toBe(true);
    expect(downloads.libraryFileNames(library()).has(names[0]!)).toBe(true);
  });

  it('never deletes a file a downloaded farbrengen also uses', async () => {
    const maamar = library().collections.maamorim.items.find((item) => item.refs.filter((ref) => ref.kind === 'pdf').length > 0)!;
    const targets = downloads.libraryItemTargets('maamorim', maamar);
    const shared = targets[0]!;
    await downloadStorage.upsertStoredDownloads([
      { target: { ...shared, key: 'pdf:5736:1:shared' }, localPath: downloadStorage.localPathForTarget(shared) },
      ...targets.map((target) => ({ target, localPath: downloadStorage.localPathForTarget(target) })),
    ]);
    await downloads.deleteLibraryItemFiles(targets);
    expect(mockUnlink).not.toHaveBeenCalledWith(downloadStorage.localPathForTarget(shared));
    const keys = (await downloadStorage.listStoredDownloads()).map((record) => record.key);
    expect(keys).toContain('pdf:5736:1:shared');
  });
});
