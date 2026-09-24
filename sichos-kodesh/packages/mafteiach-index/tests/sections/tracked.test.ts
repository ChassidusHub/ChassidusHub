import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/db.js';
import { hashValue, replaceRows, stableStringify, syncStatus, upsertTracked } from '../../src/sections/tracked.js';

describe('hashValue', () => {
  it('does not depend on key order, and ignores undefined fields', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe('{"a":[2,{"d":3}],"b":1}');
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});

describe('upsertTracked', () => {
  it('inserts, then reports unchanged, then updated, keeping first_seen_at and moving last_changed_at only on change', () => {
    const db = openDatabase(':memory:');
    const row = { url: 'https://drive.google.com/open?id=x', hebrew_year: 5711, month_token: '01', ord: 1, label: 'א' };
    expect(upsertTracked(db, 'yomanim', 'url', row, hashValue(row), 't1')).toBe('inserted');
    expect(upsertTracked(db, 'yomanim', 'url', row, hashValue(row), 't2')).toBe('unchanged');
    const edited = { ...row, label: 'ב' };
    expect(upsertTracked(db, 'yomanim', 'url', edited, hashValue(edited), 't3')).toBe('updated');
    expect(db.prepare('SELECT label, first_seen_at, last_crawled_at, last_changed_at FROM yomanim').get()).toEqual({
      label: 'ב',
      first_seen_at: 't1',
      last_crawled_at: 't3',
      last_changed_at: 't3',
    });
  });
});

describe('replaceRows', () => {
  it('replaces only the rows matching every where-column', () => {
    const db = openDatabase(':memory:');
    const put = (slug: string, ids: string[]) =>
      replaceRows(
        db,
        'memberships',
        { section: 'moadim', kind: 'moad', slug },
        ids.map((id, i) => ({ section: 'moadim', kind: 'moad', slug, item_id: id, ord: i + 1 })),
      );
    put('purim', ['1', '2']);
    put('pesach', ['3']);
    put('purim', ['2']);
    expect(db.prepare('SELECT slug, item_id FROM memberships ORDER BY slug, ord').all().map((r) => ({ ...r }))).toEqual([
      { slug: 'pesach', item_id: '3' },
      { slug: 'purim', item_id: '2' },
    ]);
  });
});

describe('syncStatus', () => {
  it('reports new and missing ids', () => {
    expect(syncStatus(['a', 'b'], ['b', 'c'])).toEqual({ newIds: ['c'], missingIds: ['a'] });
  });
});
