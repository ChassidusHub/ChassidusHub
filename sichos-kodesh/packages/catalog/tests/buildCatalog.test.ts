import { DatabaseSync } from 'node:sqlite';
import { openDatabase, upsertRecord } from '@sichos-kodesh/mafteiach-index';
import type { FarbrengenRecord } from '@sichos-kodesh/mafteiach-index';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/buildCatalog.js';

function emptySection() {
  return { hasContent: false, links: [] };
}

function makeRecord(overrides: Partial<FarbrengenRecord> = {}): FarbrengenRecord {
  return {
    id: 1,
    hebrewYear: 5711,
    hebrewDate: '5711-05-10',
    isPreNesius: false,
    occasionLabel: 'Yud Shevat, 5711',
    detail: {
      id: 1,
      biltiMugah: emptySection(),
      mugah: { hasContent: true, links: [{ label: 'מוגה', url: 'https://drive.google.com/file/d/1abcDEF23456/view?usp=sharing' }] },
      maamorim: emptySection(),
      audio: { hasContent: false, links: [] },
      video: { hasContent: false, youtubeIds: [], links: [] },
      english: emptySection(),
      tochenInyanim: { hasContent: false, text: null, links: [] },
      hagahos: emptySection(),
      hosofos: { hasContent: false, text: null, links: [] },
    },
    ...overrides,
  };
}

function insertJemAudio(db: DatabaseSync, occasionId: number, url: string, durationMs: number): void {
  db.prepare(
    'INSERT INTO jem_audio (occasion_id, ccdb_event_id, duration_ms, url, file_format, resolved_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(occasionId, 1, durationMs, url, 'mp3', '2026-01-01T00:00:00.000Z');
}

describe('buildCatalog', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('produces one CatalogEntry per occasion, grouped by Hebrew year', () => {
    upsertRecord(db, makeRecord({ id: 1, hebrewYear: 5711 }), null, '2026-01-01T00:00:00.000Z');
    upsertRecord(db, makeRecord({ id: 2, hebrewYear: 5712, hebrewDate: '5712-05-01', occasionLabel: 'Other' }), null, '2026-01-01T00:00:00.000Z');

    const byYear = buildCatalog(db);
    expect(Object.keys(byYear).sort()).toEqual(['5711', '5712']);
    expect(byYear[5711]).toHaveLength(1);
    expect(byYear[5711]![0]!.occasionLabel).toBe('Yud Shevat, 5711');
  });

  it('extracts a Drive PDF from the mugah section', () => {
    upsertRecord(db, makeRecord(), null, '2026-01-01T00:00:00.000Z');
    const [entry] = buildCatalog(db)[5711]!;
    expect(entry!.pdfs).toEqual([{ section: 'mugah', label: 'מוגה', driveFileId: '1abcDEF23456' }]);
  });

  it('excludes a reshima-labeled PDF (private notes / the Reshimos series), even from an otherwise real mugah link', () => {
    const record = makeRecord({
      detail: {
        ...makeRecord().detail,
        mugah: {
          hasContent: true,
          links: [
            { label: 'מוגה', url: 'https://drive.google.com/file/d/1abcDEF23456/view' },
            { label: 'רשימת כ"ק אד"ש', url: 'https://drive.google.com/file/d/1reshimaXXXXX/view' },
          ],
        },
      },
    });
    upsertRecord(db, record, null, '2026-01-01T00:00:00.000Z');
    const [entry] = buildCatalog(db)[5711]!;
    expect(entry!.pdfs).toEqual([{ section: 'mugah', label: 'מוגה', driveFileId: '1abcDEF23456' }]);
  });

  it('does not extract a PDF from a non-Drive link in a PDF-eligible section', () => {
    const record = makeRecord({
      detail: { ...makeRecord().detail, mugah: { hasContent: true, links: [{ label: 'x', url: 'https://www.chabad.org/x' }] } },
    });
    upsertRecord(db, record, null, '2026-01-01T00:00:00.000Z');
    const [entry] = buildCatalog(db)[5711]!;
    expect(entry!.pdfs).toEqual([]);
  });

  it('ignores links in a section that is not PDF-eligible (e.g. english)', () => {
    const record = makeRecord({
      detail: {
        ...makeRecord().detail,
        mugah: emptySection(),
        english: { hasContent: true, links: [{ label: 'x', url: 'https://drive.google.com/file/d/1abcDEF23456/view' }] },
      },
    });
    upsertRecord(db, record, null, '2026-01-01T00:00:00.000Z');
    const [entry] = buildCatalog(db)[5711]!;
    expect(entry!.pdfs).toEqual([]);
  });

  it('includes resolved JEM audio, deriving the worker filename from the CloudFront URL', () => {
    upsertRecord(db, makeRecord(), null, '2026-01-01T00:00:00.000Z');
    insertJemAudio(db, 1, 'https://dtgj2yu3gmlic.cloudfront.net/JEMSK0001.mp3', 1259000);

    const [entry] = buildCatalog(db)[5711]!;
    expect(entry!.audio).toEqual([{ workerFilename: 'JEMSK0001.mp3', durationMs: 1259000 }]);
  });

  it('an occasion with neither audio nor a PDF is still included, with empty arrays (a genuine gap, not omitted)', () => {
    upsertRecord(db, makeRecord({ detail: { ...makeRecord().detail, mugah: emptySection() } }), null, '2026-01-01T00:00:00.000Z');
    const [entry] = buildCatalog(db)[5711]!;
    expect(entry).toMatchObject({ audio: [], pdfs: [] });
  });

  it('sorts entries within a year by hebrewDate then occasionId', () => {
    upsertRecord(db, makeRecord({ id: 2, hebrewDate: '5711-05-20' }), null, '2026-01-01T00:00:00.000Z');
    upsertRecord(db, makeRecord({ id: 1, hebrewDate: '5711-05-10' }), null, '2026-01-01T00:00:00.000Z');
    const entries = buildCatalog(db)[5711]!;
    expect(entries.map((e) => e.occasionId)).toEqual([1, 2]);
  });
});
