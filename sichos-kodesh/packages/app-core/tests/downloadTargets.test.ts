import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { ALL_CONTENT_TYPES, downloadTargetKey, downloadTargetTitle, listDownloadTargets } from '../src/download/downloadTargets.js';
import type { DownloadContentTypes } from '../src/download/downloadTargets.js';

function makeEntry(overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'occasionId' | 'hebrewYear'>): CatalogEntry {
  return { hebrewDate: '5711-05-10', occasionLabel: 'test', audio: [], pdfs: [], ...overrides };
}

const NONE: DownloadContentTypes = { audio: false, hanachaEditions: [], mugah: false, maamorim: false, hagahos: false, hosofos: false };

describe('listDownloadTargets', () => {
  it('includes audio chapters when audio is enabled', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      audio: [
        { workerFilename: 'a.mp3', durationMs: 1000, chapterName: 'Sicha 1' },
        { workerFilename: 'b.mp3', durationMs: 1000 },
      ],
    });

    expect(listDownloadTargets([entry], { ...NONE, audio: true })).toEqual([
      expect.objectContaining({ kind: 'audio', workerFilename: 'a.mp3', label: 'Sicha 1' }),
      expect.objectContaining({ kind: 'audio', workerFilename: 'b.mp3', label: 'Track 2' }),
    ]);
  });

  it('includes highlighted biltiMugah PDFs only for enabled editions', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      pdfs: [
        { section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'sk' },
        { section: 'biltiMugah', label: 'תו"מ התוועדויות', driveFileId: 'tm' },
        { section: 'biltiMugah', label: 'another source', driveFileId: 'other' },
      ],
    });

    expect(listDownloadTargets([entry], { ...NONE, hanachaEditions: ['sichosKodesh'] }).map((target) => target.driveFileId)).toEqual(['sk']);
    expect(listDownloadTargets([entry], { ...NONE, hanachaEditions: ['sichosKodesh', 'torasMenachem'] }).map((target) => target.driveFileId).sort()).toEqual(['sk', 'tm']);
    expect(listDownloadTargets([entry], ALL_CONTENT_TYPES).map((target) => target.driveFileId)).not.toContain('other');
  });

  it('includes each non-biltiMugah section behind its own toggle', () => {
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

    expect(listDownloadTargets([entry], { ...NONE, mugah: true }).map((target) => target.driveFileId)).toEqual(['m']);
    expect(listDownloadTargets([entry], { ...NONE, maamorim: true }).map((target) => target.driveFileId)).toEqual(['a']);
    expect(listDownloadTargets([entry], { ...NONE, hagahos: true }).map((target) => target.driveFileId)).toEqual(['g']);
    expect(listDownloadTargets([entry], { ...NONE, hosofos: true }).map((target) => target.driveFileId)).toEqual(['h']);
  });

  it('generates stable keys for deduping and persistence', () => {
    const audioKey = downloadTargetKey({
      hebrewYear: 5711,
      occasionId: 42,
      label: 'Track 1',
      kind: 'audio',
      chapterIndex: 0,
      workerFilename: 'a.mp3',
    });
    const pdfKey = downloadTargetKey({
      hebrewYear: 5711,
      occasionId: 42,
      label: 'PDF',
      kind: 'pdf',
      driveFileId: 'file-id',
      resourceKey: null,
      section: 'mugah',
    });

    expect(audioKey).toBe('audio:5711:42:0:a.mp3');
    expect(pdfKey).toBe('pdf:5711:42:file-id');
  });
});

describe('downloadTargetTitle', () => {
  const entry = makeEntry({
    occasionId: 1,
    hebrewYear: 5711,
    audio: [
      { workerFilename: 'a.mp3', durationMs: 1000, chapterName: 'Sicha 1', chapterNameHe: 'שיחה א׳' },
      { workerFilename: 'b.mp3', durationMs: 1000 },
    ],
    pdfs: [{ section: 'mugah', label: 'מוגה', driveFileId: 'm' }],
  });
  const [sicha, unnamed, pdf] = listDownloadTargets([entry], ALL_CONTENT_TYPES);

  it('names a recording by its chapter in the UI language', () => {
    expect(downloadTargetTitle(sicha!, entry, 'he')).toBe('שיחה א׳');
    expect(downloadTargetTitle(sicha!, entry, 'en')).toBe('Sicha 1');
    expect(downloadTargetTitle(unnamed!, entry, 'he')).toBe('קטע 2');
  });

  it("keeps the target's own label for a PDF, or when the entry is not at hand", () => {
    expect(downloadTargetTitle(pdf!, entry, 'en')).toBe('מוגה');
    expect(downloadTargetTitle(sicha!, undefined, 'he')).toBe('Sicha 1');
  });
});
