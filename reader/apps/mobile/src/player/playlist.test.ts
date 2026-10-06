import type { CatalogEntry } from '@chassidushub-reader/catalog';

const mockLocalAudioFileUrlIfExists = jest.fn<
  Promise<string | null>,
  [string]
>(() => Promise.resolve(null));

jest.mock('../download/download', () => {
  const actual = jest.requireActual('../download/download');
  return {
    ...actual,
    localAudioFileUrlIfExists: mockLocalAudioFileUrlIfExists,
  };
});

const playlist = require('./playlist') as typeof import('./playlist');

function makeEntry(overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'occasionId' | 'hebrewYear'>): CatalogEntry {
  const { occasionId, hebrewYear, ...rest } = overrides;
  return {
    occasionId,
    hebrewYear,
    hebrewDate: '5711-05-10',
    occasionLabel: 'Test Occasion',
    audio: [],
    pdfs: [],
    ...rest,
  };
}

describe('catalogAudioToTracks', () => {
  beforeEach(() => {
    mockLocalAudioFileUrlIfExists.mockReset();
    mockLocalAudioFileUrlIfExists.mockResolvedValue(null);
  });

  it('maps audio array to RNTP Track objects', async () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      occasionLabel: 'Shabbos Parshas Bereishis',
      audio: [
        { workerFilename: 'abc.mp3', durationMs: 3600000, chapterName: 'Sicha 1' },
        { workerFilename: 'def.mp3', durationMs: 1800000, chapterName: undefined },
      ],
    });

    const tracks = await playlist.catalogAudioToTracks(entry, 'en');

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      id: 'abc.mp3',
      title: 'Sicha 1',
      artist: 'ChassidusHub',
      album: 'Shabbos Parshas Bereishis',
      duration: 3600,
    });
    expect(tracks[1]).toMatchObject({
      id: 'def.mp3',
      title: 'Track 2',
      artist: 'ChassidusHub',
    });
    expect(typeof tracks[0]?.url).toBe('string');
  });

  it('uses occasionLabel as title when only one audio item', async () => {
    const entry = makeEntry({
      occasionId: 2,
      hebrewYear: 5712,
      occasionLabel: 'Yud Tes Kislev Farbrengen',
      audio: [{ workerFilename: 'xyz.mp3', durationMs: 7200000, chapterName: undefined }],
    });

    const tracks = await playlist.catalogAudioToTracks(entry, 'en');
    expect(tracks[0]?.title).toBe('Yud Tes Kislev Farbrengen');
  });

  it('names the tracks in the UI language - the notification and lock screen follow it', async () => {
    const entry = makeEntry({
      occasionId: 3,
      hebrewYear: 5712,
      occasionLabel: `ו' תשרי`,
      occasionLabelEn: '6 Tishrei',
      audio: [
        { workerFilename: 'a.mp3', durationMs: 1000, chapterName: 'Sicha 1', chapterNameHe: 'שיחה א׳' },
        { workerFilename: 'b.mp3', durationMs: 1000 },
      ],
    });

    const english = await playlist.catalogAudioToTracks(entry, 'en');
    expect(english.map((track) => [track.title, track.album])).toEqual([
      ['Sicha 1', '6 Tishrei'],
      ['Track 2', '6 Tishrei'],
    ]);
    const hebrew = await playlist.catalogAudioToTracks(entry, 'he');
    expect(hebrew.map((track) => [track.title, track.album])).toEqual([
      ['שיחה א׳', `ו' תשרי`],
      ['קטע 2', `ו' תשרי`],
    ]);
  });

  it('uses file:// URL for downloaded chapters and network URL otherwise', async () => {
    const entry = makeEntry({
      occasionId: 2,
      hebrewYear: 5712,
      occasionLabel: 'Yud Tes Kislev Farbrengen',
      audio: [
        { workerFilename: 'cached.mp3', durationMs: 1000 },
        { workerFilename: 'remote.mp3', durationMs: 1000 },
      ],
    });
    mockLocalAudioFileUrlIfExists.mockImplementation(async (workerFilename) =>
      workerFilename === 'cached.mp3' ? 'file:///documents/cached.mp3' : null,
    );

    const tracks = await playlist.catalogAudioToTracks(entry, 'en');

    expect(tracks[0]?.url).toBe('file:///documents/cached.mp3');
    expect(String(tracks[1]?.url)).toContain('/jem-audio/remote.mp3');
  });
});

