import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { allKnownEventIds, openDatabase, replaceAudioRecordings, upsertEvent } from '../src/db.js';
import type { CcdbDate, JemAudioRecordingRow, JemEventNode } from '../src/types.js';

function makeDate(overrides: Partial<CcdbDate> = {}): CcdbDate {
  return {
    secular_year: 1951,
    secular_month: 1,
    secular_day: 17,
    hebrew_year: 5711,
    hebrew_month: 5,
    hebrew_day: 10,
    hebrew_month_name: 'Shevat',
    after_nightfall: false,
    ...overrides,
  };
}

function makeNode(overrides: Partial<JemEventNode> = {}): JemEventNode {
  return {
    id: 1,
    parentId: null,
    name: 'Farbrengen, Yud Shevat, 5711',
    type: 'Farbrengen',
    hasLongDescription: false,
    hasTranscript: false,
    dates: [makeDate()],
    hasOwnAudio: false,
    ...overrides,
  };
}

function makeRecording(overrides: Partial<JemAudioRecordingRow> = {}): JemAudioRecordingRow {
  return {
    eventId: 1,
    ccdbRecordingId: 100,
    name: 'Sicha 1',
    durationMs: 60_000,
    url: 'https://dtgj2yu3gmlic.cloudfront.net/example.mp3',
    fileFormat: 'mp3',
    ...overrides,
  };
}

describe('db', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('inserts a new event and reports status "inserted"', () => {
    const result = upsertEvent(db, makeNode(), '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('inserted');
    expect(allKnownEventIds(db)).toEqual([1]);
  });

  it('re-upserting identical content reports "unchanged" and does not touch last_changed_at', () => {
    upsertEvent(db, makeNode(), '2026-01-01T00:00:00.000Z');
    const result = upsertEvent(db, makeNode(), '2026-02-01T00:00:00.000Z');
    expect(result.status).toBe('unchanged');
    const row = db.prepare('SELECT first_seen_at, last_changed_at, last_crawled_at FROM events WHERE id = ?').get(1) as {
      first_seen_at: string;
      last_changed_at: string;
      last_crawled_at: string;
    };
    expect(row.first_seen_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.last_changed_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.last_crawled_at).toBe('2026-02-01T00:00:00.000Z');
  });

  it('a genuine content change reports "updated" and bumps last_changed_at', () => {
    upsertEvent(db, makeNode(), '2026-01-01T00:00:00.000Z');
    const changed = makeNode({ name: 'Edited Name' });
    const result = upsertEvent(db, changed, '2026-02-01T00:00:00.000Z');
    expect(result.status).toBe('updated');
    const row = db.prepare('SELECT last_changed_at, name FROM events WHERE id = ?').get(1) as {
      last_changed_at: string;
      name: string;
    };
    expect(row.last_changed_at).toBe('2026-02-01T00:00:00.000Z');
    expect(row.name).toBe('Edited Name');
  });

  it('denormalizes the primary date into real columns', () => {
    upsertEvent(db, makeNode(), '2026-01-01T00:00:00.000Z');
    const row = db.prepare(
      'SELECT hebrew_year, hebrew_month, hebrew_day, hebrew_month_name, secular_year, secular_month, secular_day, after_nightfall FROM events WHERE id = ?',
    ).get(1);
    expect(row).toEqual({
      hebrew_year: 5711,
      hebrew_month: 5,
      hebrew_day: 10,
      hebrew_month_name: 'Shevat',
      secular_year: 1951,
      secular_month: 1,
      secular_day: 17,
      after_nightfall: 0,
    });
  });

  it('stores null date columns for an event with no dates', () => {
    upsertEvent(db, makeNode({ dates: [] }), '2026-01-01T00:00:00.000Z');
    const row = db.prepare('SELECT hebrew_year, secular_year, after_nightfall FROM events WHERE id = ?').get(1);
    expect(row).toEqual({ hebrew_year: null, secular_year: null, after_nightfall: null });
  });

  it('stores boolean flags as 0/1', () => {
    upsertEvent(db, makeNode({ hasLongDescription: true, hasTranscript: true, hasOwnAudio: true }), '2026-01-01T00:00:00.000Z');
    const row = db.prepare('SELECT has_long_description, has_transcript, has_own_audio FROM events WHERE id = ?').get(1);
    expect(row).toEqual({ has_long_description: 1, has_transcript: 1, has_own_audio: 1 });
  });

  it('replaceAudioRecordings inserts recordings tied to an event', () => {
    upsertEvent(db, makeNode(), '2026-01-01T00:00:00.000Z');
    replaceAudioRecordings(db, 1, [makeRecording()]);
    const rows = db.prepare('SELECT event_id, ccdb_recording_id, url FROM audio_recordings WHERE event_id = ?').all(1);
    expect(rows).toEqual([{ event_id: 1, ccdb_recording_id: 100, url: 'https://dtgj2yu3gmlic.cloudfront.net/example.mp3' }]);
  });

  it('replaceAudioRecordings replaces (not appends) existing rows for that event', () => {
    upsertEvent(db, makeNode(), '2026-01-01T00:00:00.000Z');
    replaceAudioRecordings(db, 1, [makeRecording({ ccdbRecordingId: 100 })]);
    replaceAudioRecordings(db, 1, [makeRecording({ ccdbRecordingId: 200 })]);
    const rows = db.prepare('SELECT ccdb_recording_id FROM audio_recordings WHERE event_id = ?').all(1);
    expect(rows).toEqual([{ ccdb_recording_id: 200 }]);
  });

  it('allKnownEventIds reflects every inserted event', () => {
    upsertEvent(db, makeNode({ id: 1 }), '2026-01-01T00:00:00.000Z');
    upsertEvent(db, makeNode({ id: 2, parentId: 1 }), '2026-01-01T00:00:00.000Z');
    expect(allKnownEventIds(db).sort((a, b) => a - b)).toEqual([1, 2]);
  });
});
