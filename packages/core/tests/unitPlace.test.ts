import { beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import type { Json } from '@chassidushub/core';
import { add, freshCatalog } from './helpers.js';

/**
 * unit_place (migration 0030) holds each unit's sefer, order and place, so
 * a page lists a sefer's units without reading their words. The database
 * keeps it as main moves: a unit merged, changed, moved or deleted is
 * there as it is now, and nothing that is not a unit of a sefer is.
 */

let catalog: Catalog;
let shelf: EntityId;
let work: EntityId;

const unit = (n: number, extra: Record<string, Json> = {}): Json => ({
  work,
  position: [{ level: 'volume', value: '1', label: { he: 'חלק א' } }, { level: 'sicha', value: String(n), label: { he: String(n) } }],
  order: `a${n}`,
  label: { he: `שיחה ${n}` },
  ...extra,
});

const places = async () => (await catalog.db.query<{ unit_id: string; work_id: string; ord: string; part: string | null; label: unknown; path: string | null }>('SELECT unit_id, work_id, ord, part, label, path FROM unit_place ORDER BY ord')).rows;

beforeEach(async () => {
  catalog = (await freshCatalog()).catalog;
  shelf = await add(catalog, 'steward', 'steward', 'set', { name: { he: 'הרבי' }, slug: 'the-rebbe', policy: 'moderated', keepers: ['keeper'] }, '/sets/the-rebbe');
  work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ליקוטי שיחות' }, slug: 'ls', authors: [], genre: 'sichos', levels: ['volume', 'sicha'], sets: [shelf] }, '/ls');
});

describe('unit_place', () => {
  it('keeps every unit of a sefer as main has it, and nothing else', async () => {
    const one = await add(catalog, 'mendy', 'keeper', 'unit', unit(1), '/ls/1/1');
    const two = await add(catalog, 'mendy', 'keeper', 'unit', unit(2), '/ls/1/2');
    expect(await places()).toEqual([
      { unit_id: one, work_id: work, ord: 'a1', part: '1', label: { he: 'שיחה 1' }, path: '/ls/1/1' },
      { unit_id: two, work_id: work, ord: 'a2', part: '1', label: { he: 'שיחה 2' }, path: '/ls/1/2' },
    ]);

    // Changed and moved: the row follows.
    const cs = await catalog.createChangeset('mendy', { title: 'Move' });
    await catalog.putRevision(cs.id, 'mendy', { id: one, type: 'unit', data: unit(1, { order: 'a3', label: { he: 'שיחה ג' } }), path: '/ls/1/3' });
    await catalog.submit(cs.id, 'mendy');
    await catalog.merge(cs.id, 'keeper');
    expect((await places()).map((p) => [p.unit_id, p.ord, p.path])).toEqual([
      [two, 'a2', '/ls/1/2'],
      [one, 'a3', '/ls/1/3'],
    ]);

    // Deleted: gone.
    const gone = await catalog.createChangeset('mendy', { title: 'Delete' });
    await catalog.putRevision(gone.id, 'mendy', { id: two, type: 'unit', data: null });
    await catalog.submit(gone.id, 'mendy');
    await catalog.merge(gone.id, 'keeper');
    expect((await places()).map((p) => p.unit_id)).toEqual([one]);
  });
});
