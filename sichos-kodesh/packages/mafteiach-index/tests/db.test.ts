import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { allKnownIds, getEtag, openDatabase, upsertRecord } from '../src/db.js';
import type { FarbrengenRecord } from '../src/types.js';

function emptySection() {
  return { hasContent: false, links: [] };
}

function makeRecord(overrides: Partial<FarbrengenRecord> = {}): FarbrengenRecord {
  return {
    id: 1,
    hebrewYear: 5711,
    hebrewDate: '5711-02-10',
    isPreNesius: false,
    occasionLabel: 'Test Occasion',
    detail: {
      id: 1,
      biltiMugah: emptySection(),
      mugah: { hasContent: true, links: [{ label: 'a', url: 'https://example.com/a', group: 'הנחה' }] },
      maamorim: emptySection(),
      audio: { hasContent: false, links: [] },
      video: { hasContent: false, youtubeIds: [], links: [] },
      english: emptySection(),
      tochenInyanim: { hasContent: true, text: 'a short synthetic note', links: [] },
      hagahos: emptySection(),
      hosofos: { hasContent: false, text: null, links: [] },
    },
    ...overrides,
  };
}

describe('db', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('inserts a new record and reports status "inserted"', () => {
    const result = upsertRecord(db, makeRecord(), 'etag-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('inserted');
    expect(allKnownIds(db)).toEqual([1]);
    expect(getEtag(db, 1)).toBe('etag-1');
  });

  it('re-upserting identical content reports "unchanged" and does not touch last_changed_at', () => {
    upsertRecord(db, makeRecord(), 'etag-1', '2026-01-01T00:00:00.000Z');
    const result = upsertRecord(db, makeRecord(), 'etag-1', '2026-02-01T00:00:00.000Z');
    expect(result.status).toBe('unchanged');
    const row = db.prepare('SELECT first_seen_at, last_changed_at, last_crawled_at FROM occasions WHERE id = ?').get(1) as {
      first_seen_at: string;
      last_changed_at: string;
      last_crawled_at: string;
    };
    expect(row.first_seen_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.last_changed_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.last_crawled_at).toBe('2026-02-01T00:00:00.000Z');
  });

  it('a genuine content change reports "updated" and bumps last_changed_at', () => {
    upsertRecord(db, makeRecord(), 'etag-1', '2026-01-01T00:00:00.000Z');
    const changed = makeRecord({ occasionLabel: 'Edited Occasion' });
    const result = upsertRecord(db, changed, 'etag-2', '2026-02-01T00:00:00.000Z');
    expect(result.status).toBe('updated');
    const row = db.prepare('SELECT last_changed_at, occasion_label FROM occasions WHERE id = ?').get(1) as {
      last_changed_at: string;
      occasion_label: string;
    };
    expect(row.last_changed_at).toBe('2026-02-01T00:00:00.000Z');
    expect(row.occasion_label).toBe('Edited Occasion');
  });

  it('stores boolean section flags as 0/1 matching detail.hasContent', () => {
    upsertRecord(db, makeRecord(), null, '2026-01-01T00:00:00.000Z');
    const row = db.prepare('SELECT has_mugah, has_bilti_mugah, has_audio FROM occasions WHERE id = ?').get(1) as {
      has_mugah: number;
      has_bilti_mugah: number;
      has_audio: number;
    };
    expect(row).toEqual({ has_mugah: 1, has_bilti_mugah: 0, has_audio: 0 });
  });

  it('writes links into the child table, grouped and ungrouped alike', () => {
    upsertRecord(db, makeRecord(), null, '2026-01-01T00:00:00.000Z');
    const links = db.prepare('SELECT section, group_label, label, url FROM links WHERE occasion_id = ?').all(1);
    expect(links).toEqual([{ section: 'mugah', group_label: 'הנחה', label: 'a', url: 'https://example.com/a' }]);
  });

  it('replaces (not appends) child rows when content actually changes', () => {
    upsertRecord(db, makeRecord(), null, '2026-01-01T00:00:00.000Z');
    const changed = makeRecord({
      detail: {
        ...makeRecord().detail,
        mugah: { hasContent: true, links: [{ label: 'b', url: 'https://example.com/b' }] },
      },
    });
    upsertRecord(db, changed, null, '2026-02-01T00:00:00.000Z');
    const links = db.prepare('SELECT label FROM links WHERE occasion_id = ?').all(1);
    expect(links).toEqual([{ label: 'b' }]);
  });

  it('stores video ids in their own table', () => {
    const withVideo = makeRecord({
      detail: { ...makeRecord().detail, video: { hasContent: true, youtubeIds: ['abc123'], links: [] } },
    });
    upsertRecord(db, withVideo, null, '2026-01-01T00:00:00.000Z');
    const rows = db.prepare('SELECT youtube_id FROM video_ids WHERE occasion_id = ?').all(1);
    expect(rows).toEqual([{ youtube_id: 'abc123' }]);
  });

  it('stores a non-YouTube video link (chabad.org/Vimeo/etc.) in the links table under section "video"', () => {
    const withExternalVideo = makeRecord({
      detail: {
        ...makeRecord().detail,
        video: { hasContent: true, youtubeIds: [], links: [{ label: 'video', url: 'https://www.chabad.org/example' }] },
      },
    });
    upsertRecord(db, withExternalVideo, null, '2026-01-01T00:00:00.000Z');
    const rows = db.prepare("SELECT url FROM links WHERE occasion_id = ? AND section = 'video'").all(1);
    expect(rows).toEqual([{ url: 'https://www.chabad.org/example' }]);
  });

  it('allKnownIds reflects every inserted occasion', () => {
    upsertRecord(db, makeRecord({ id: 1 }), null, '2026-01-01T00:00:00.000Z');
    upsertRecord(db, makeRecord({ id: 2 }), null, '2026-01-01T00:00:00.000Z');
    expect(allKnownIds(db).sort()).toEqual([1, 2]);
  });

  it('getEtag returns null for an unknown id', () => {
    expect(getEtag(db, 999)).toBeNull();
  });
});
