const mockGetItem = jest.fn<Promise<string | null>, [string]>(() => Promise.resolve(null));
const mockSetItem = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockGetItem,
  setItem: mockSetItem,
}));

const persistence = require('./progressPersistence') as typeof import('./progressPersistence');

describe('progressPersistence', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue();
  });

  it('returns an empty store when storage JSON is corrupt', async () => {
    mockGetItem.mockResolvedValue('{not-json');

    const store = await persistence.readPlayerProgressStore();

    expect(store).toEqual({
      version: 1,
      occasions: {},
      lastQueue: null,
    });
  });

  it('sanitizes malformed occasion progress values', async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        occasions: {
          good: {
            hebrewYear: 5711,
            occasionId: 1,
            occasionLabel: 'Occasion',
            lastVisitedAt: 10,
            lastPlayedAudioId: 'a.mp3',
            chapterProgressByAudioId: {
              'a.mp3': { position: 15, duration: 60 },
              bad: { position: 'x' },
            },
          },
          bad: {
            hebrewYear: 'x',
            occasionId: null,
          },
        },
        lastQueue: {
          hebrewYear: 5711,
          occasionId: 1,
          currentAudioId: 'a.mp3',
          position: 15,
          savedAt: 50,
        },
      }),
    );

    const store = await persistence.readPlayerProgressStore();

    expect(Object.keys(store.occasions)).toEqual(['good']);
    expect(store.occasions.good?.chapterProgressByAudioId.bad).toEqual({
      position: 0,
      duration: 0,
    });
    expect(store.lastQueue).toEqual({
      hebrewYear: 5711,
      occasionId: 1,
      currentAudioId: 'a.mp3',
      position: 15,
      savedAt: 50,
    });
  });

  it('writes normalized payloads', async () => {
    await persistence.writePlayerProgressStore({
      version: 999,
      occasions: {
        '5711:1': {
          hebrewYear: 5711,
          occasionId: 1,
          occasionLabel: 'Occasion',
          lastVisitedAt: 10,
          lastPlayedAudioId: 'a.mp3',
          chapterProgressByAudioId: {
            'a.mp3': { position: 15, duration: 60 },
          },
        },
      },
      lastQueue: null,
    });

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSetItem.mock.calls[0]![1]);
    expect(payload.version).toBe(1);
    expect(payload.occasions['5711:1'].lastPlayedAudioId).toBe('a.mp3');
  });
});
