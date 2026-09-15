import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { listDownloadTargets } from './downloadManager';
import type { DownloadContentTypes } from './downloadManager';

function makeEntry(overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'occasionId' | 'hebrewYear'>): CatalogEntry {
  return { hebrewDate: '5711-05-10', occasionLabel: 'test', audio: [], pdfs: [], ...overrides };
}

const NONE: DownloadContentTypes = { audio: false, hanachaEditions: [], mugah: false, maamorim: false, hagahos: false, hosofos: false };

describe('listDownloadTargets', () => {
  it('includes every audio chapter when audio is enabled, and none when disabled', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      audio: [
        { workerFilename: 'a.mp3', durationMs: 1000, chapterName: 'Sicha 1' },
        { workerFilename: 'b.mp3', durationMs: 1000, chapterName: 'Sicha 2' },
      ],
    });

    const withAudio = listDownloadTargets([entry], { ...NONE, audio: true });
    expect(withAudio.map((t) => t.kind)).toEqual(['audio', 'audio']);
    expect(withAudio.map((t) => t.url)).toEqual([expect.stringContaining('a.mp3'), expect.stringContaining('b.mp3')]);

    expect(listDownloadTargets([entry], { ...NONE, audio: false })).toEqual([]);
  });

  it('includes a highlighted biltiMugah pdf only when its edition is enabled', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      pdfs: [
        { section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'sk' },
        { section: 'biltiMugah', label: 'תו"מ התוועדויות', driveFileId: 'tm' },
      ],
    });

    const skOnly = listDownloadTargets([entry], { ...NONE, hanachaEditions: ['sichosKodesh'] });
    expect(skOnly.map((t) => t.label)).toEqual(['שיחו"ק']);

    const both = listDownloadTargets([entry], { ...NONE, hanachaEditions: ['sichosKodesh', 'torasMenachem'] });
    expect(both.map((t) => t.label).sort()).toEqual(['שיחו"ק', 'תו"מ התוועדויות'].sort());

    expect(listDownloadTargets([entry], NONE)).toEqual([]);
  });

  it('never includes a biltiMugah pdf citing neither highlighted edition, regardless of settings - no toggle covers it', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      pdfs: [{ section: 'biltiMugah', label: 'some other source', driveFileId: 'other' }],
    });

    const everything: DownloadContentTypes = { audio: true, hanachaEditions: ['sichosKodesh', 'torasMenachem'], mugah: true, maamorim: true, hagahos: true, hosofos: true };
    expect(listDownloadTargets([entry], everything)).toEqual([]);
  });

  it('includes mugah/maamorim/hagahos/hosofos pdfs independently, each gated by its own toggle', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      pdfs: [
        { section: 'mugah', label: 'mugah pdf', driveFileId: 'm' },
        { section: 'maamorim', label: 'maamar pdf', driveFileId: 'a' },
        { section: 'hagahos', label: 'hagahos pdf', driveFileId: 'g' },
        { section: 'hosofos', label: 'hosofos pdf', driveFileId: 'h' },
      ],
    });

    expect(listDownloadTargets([entry], { ...NONE, mugah: true }).map((t) => t.label)).toEqual(['mugah pdf']);
    expect(listDownloadTargets([entry], { ...NONE, maamorim: true }).map((t) => t.label)).toEqual(['maamar pdf']);
    expect(listDownloadTargets([entry], { ...NONE, hagahos: true }).map((t) => t.label)).toEqual(['hagahos pdf']);
    expect(listDownloadTargets([entry], { ...NONE, hosofos: true }).map((t) => t.label)).toEqual(['hosofos pdf']);
    expect(listDownloadTargets([entry], NONE)).toEqual([]);
  });

  it('tags every target with its occasion so callers can group results back by occasion', () => {
    const entry = makeEntry({
      occasionId: 42,
      hebrewYear: 5711,
      audio: [{ workerFilename: 'a.mp3', durationMs: 1000 }],
    });

    const [target] = listDownloadTargets([entry], { ...NONE, audio: true });
    expect(target).toMatchObject({ hebrewYear: 5711, occasionId: 42 });
  });
});
