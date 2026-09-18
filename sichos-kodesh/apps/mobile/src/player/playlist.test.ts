import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { catalogAudioToChapter, catalogAudioToTracks } from './playlist';

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
  it('maps audio array to RNTP Track objects', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      occasionLabel: 'Shabbos Parshas Bereishis',
      audio: [
        { workerFilename: 'abc.mp3', durationMs: 3600000, chapterName: 'Sicha 1' },
        { workerFilename: 'def.mp3', durationMs: 1800000, chapterName: undefined },
      ],
    });

    const tracks = catalogAudioToTracks(entry);

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      id: 'abc.mp3',
      title: 'Sicha 1',
      artist: 'Sichos Kodesh',
      album: 'Shabbos Parshas Bereishis',
      duration: 3600,
    });
    expect(tracks[1]).toMatchObject({
      id: 'def.mp3',
      title: 'Track 2',
      artist: 'Sichos Kodesh',
    });
    expect(typeof tracks[0]?.url).toBe('string');
  });

  it('uses occasionLabel as title when only one audio item', () => {
    const entry = makeEntry({
      occasionId: 2,
      hebrewYear: 5712,
      occasionLabel: 'Yud Tes Kislev Farbrengen',
      audio: [{ workerFilename: 'xyz.mp3', durationMs: 7200000, chapterName: undefined }],
    });

    const tracks = catalogAudioToTracks(entry);
    expect(tracks[0]?.title).toBe('Yud Tes Kislev Farbrengen');
  });
});

describe('catalogAudioToChapter', () => {
  it('maps CatalogAudio to PlayerChapter', () => {
    const entry = makeEntry({
      occasionId: 3,
      hebrewYear: 5713,
      occasionLabel: 'My Occasion',
      audio: [{ workerFilename: 'q.mp3', durationMs: 500, chapterName: 'Part A' }],
    });

    const chapter = catalogAudioToChapter(entry, entry.audio[0]!);

    expect(chapter).toMatchObject({
      workerFilename: 'q.mp3',
      chapterName: 'Part A',
      durationMs: 500,
      occasionId: 3,
      hebrewYear: 5713,
      occasionLabel: 'My Occasion',
    });
  });
});
