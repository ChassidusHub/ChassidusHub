import type { CatalogEntry } from '@chassidushub-reader/catalog';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const mockExists = jest.fn<Promise<boolean>, [string]>(() => Promise.resolve(true));
const mockLs = jest.fn<Promise<string[]>, [string]>(() => Promise.resolve([]));
const mockUnlink = jest.fn<Promise<void>, [string]>(() => Promise.resolve());

jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/documents' },
    exists: mockExists,
    ls: mockLs,
    stat: jest.fn(() => Promise.resolve({ size: '0' })),
    unlink: mockUnlink,
  },
}));

const appCore = require('@chassidushub-reader/app-core') as typeof import('@chassidushub-reader/app-core');
const downloadStorage = require('./downloadStorage') as typeof import('./downloadStorage');

function makeEntry(overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'occasionId' | 'hebrewYear'>): CatalogEntry {
  return { hebrewDate: '5711-05-10', occasionLabel: 'test', audio: [], pdfs: [], ...overrides };
}

describe('downloadStorage', () => {
  beforeEach(() => {
    mockExists.mockClear();
    mockExists.mockResolvedValue(true);
    mockLs.mockClear();
    mockLs.mockResolvedValue([]);
    mockUnlink.mockClear();
    mockUnlink.mockResolvedValue();
  });

  it('maps targets to app-owned filenames and paths', () => {
    const [audioTarget, pdfTarget] = appCore.listDownloadTargets(
      [
        makeEntry({
          occasionId: 1,
          hebrewYear: 5711,
          audio: [{ workerFilename: 'a.mp3', durationMs: 1000 }],
          pdfs: [{ section: 'mugah', label: 'pdf', driveFileId: 'pdf-id' }],
        }),
      ],
      appCore.ALL_CONTENT_TYPES,
    );

    expect(downloadStorage.fileNameForTarget(audioTarget!)).toBe('a.mp3');
    expect(downloadStorage.fileNameForTarget(pdfTarget!)).toBe('pdf-id.pdf');
    expect(downloadStorage.localPathForTarget(audioTarget!)).toBe('/documents/a.mp3');
  });

  it('lists downloaded occasions by matching app-owned files on disk', async () => {
    mockLs.mockResolvedValue(['a.mp3', 'unrelated.tmp']);

    const results = await downloadStorage.listDownloadedOccasions([
      makeEntry({
        occasionId: 1,
        hebrewYear: 5711,
        occasionLabel: 'Occasion',
        audio: [{ workerFilename: 'a.mp3', durationMs: 1000 }],
        pdfs: [{ section: 'mugah', label: 'pdf', driveFileId: 'pdf-id' }],
      }),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.entry.occasionLabel).toBe('Occasion');
    expect(results[0]!.audioCount).toBe(1);
    expect(results[0]!.pdfCount).toBe(0);
  });

  it('clears only app-owned target paths', async () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      audio: [{ workerFilename: 'a.mp3', durationMs: 1000 }],
      pdfs: [{ section: 'mugah', label: 'pdf', driveFileId: 'pdf-id' }],
    });

    await downloadStorage.clearAllDownloadedFiles([entry]);

    expect(mockUnlink).toHaveBeenCalledWith('/documents/a.mp3');
    expect(mockUnlink).toHaveBeenCalledWith('/documents/pdf-id.pdf');
  });
});
