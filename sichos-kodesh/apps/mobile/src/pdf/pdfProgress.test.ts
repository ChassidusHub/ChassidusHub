export {};

const mockGetItem = jest.fn<Promise<string | null>, [string]>(() =>
  Promise.resolve(null),
);
const mockSetItem = jest.fn<Promise<void>, [string, string]>(() =>
  Promise.resolve(),
);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockGetItem,
  setItem: mockSetItem,
}));

const progress = require('./pdfProgress') as typeof import('./pdfProgress');

describe('pdfProgress', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue();
  });

  it('returns an empty store when storage JSON is corrupt', async () => {
    mockGetItem.mockResolvedValue('{not-json');

    await expect(progress.readPdfProgressStore()).resolves.toEqual({
      version: 1,
      pages: {},
    });
  });

  it('sanitizes malformed page records', async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        version: 999,
        pages: {
          good: { page: 9, totalPages: 12, updatedAt: 44 },
          badPage: { page: -4, totalPages: 'x', updatedAt: 12 },
          badShape: null,
        },
      }),
    );

    const store = await progress.readPdfProgressStore();

    expect(store.version).toBe(1);
    expect(store.pages.good).toEqual({ page: 9, totalPages: 12, updatedAt: 44 });
    expect(store.pages.badPage).toEqual({ page: 1, totalPages: null, updatedAt: 12 });
    expect(store.pages.badShape).toBeUndefined();
  });

  it('loads and writes normalized page progress', async () => {
    const saved = {
      version: 1,
      pages: {
        'pdf:5711:8:drive-file': { page: 6, totalPages: 20, updatedAt: 50 },
      },
    };
    mockGetItem.mockResolvedValueOnce(JSON.stringify(saved));

    await expect(
      progress.loadSavedPdfProgress({
        hebrewYear: 5711,
        occasionId: 8,
        driveFileId: 'drive-file',
      }),
    ).resolves.toEqual({ page: 6, totalPages: 20, updatedAt: 50 });

    mockGetItem.mockResolvedValueOnce(JSON.stringify(saved));
    await progress.savePdfProgress(
      {
        hebrewYear: 5711,
        occasionId: 8,
        driveFileId: 'drive-file',
      },
      25,
      20,
    );

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSetItem.mock.calls[0]![1]);
    expect(payload.version).toBe(1);
    expect(payload.pages['pdf:5711:8:drive-file'].page).toBe(20);
    expect(payload.pages['pdf:5711:8:drive-file'].totalPages).toBe(20);
    expect(payload.pages['pdf:5711:8:drive-file'].updatedAt).toEqual(
      expect.any(Number),
    );
    expect(payload.pages['pdf:5711:8:drive-file'].updatedAt).not.toBe(50);
  });
});
