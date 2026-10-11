import { describe, expect, it } from 'vitest';
import { measured } from '@chassidushub/db';
import { Catalog } from '@chassidushub/core';
import { createApp } from '../src/app.js';
import { add, freshCatalog } from '../../../packages/core/tests/helpers.js';

/** GET /v1/entities/{id}/path-bar: the new site's path bar in one read (packages/core/src/pathBar.ts). */
describe('GET /v1/entities/{id}/path-bar', () => {
  it("answers a unit's levels, its own read and two more statements, and none for an event", async () => {
    const { catalog, set } = await freshCatalog();
    const work = await add(catalog, 'steward', 'steward', 'work', { title: { he: 'לקוטי שיחות' }, slug: 'likkutei-sichos', authors: [], genre: 'sichos', levels: ['volume', 'sicha'], sets: [set] }, '/likkutei-sichos');
    const unit = await add(catalog, 'steward', 'steward', 'unit', { work, position: [{ level: 'volume', value: '1' }, { level: 'sicha', value: '1' }], order: 'a', label: { he: 'בראשית' } }, '/likkutei-sichos/1/1');
    const event = await add(catalog, 'steward', 'steward', 'event', { kind: 'farbrengen', title: { he: 'יו״ד שבט' }, date: '5742-05-10', sets: [set] }, '/events/5742-05-10');
    const db = measured(catalog.db);
    const app = createApp({ catalog: new Catalog(db) });
    const res = await app.request(`/v1/entities/${unit}/path-bar`);
    expect(res.status).toBe(200);
    expect(db.cost.statements).toBe(3);
    const { levels } = (await res.json()) as { levels: Array<{ kind: string; chosen: { path: string } }> };
    expect(levels.map((l) => [l.kind, l.chosen.path])).toEqual([
      ['set', '/farbrengens'],
      ['work', '/likkutei-sichos'],
      ['part', '/likkutei-sichos/1'],
      ['unit', '/likkutei-sichos/1/1'],
    ]);
    expect(await (await app.request(`/v1/entities/${event}/path-bar`)).json()).toEqual({ levels: [] });
    expect((await app.request('/v1/entities/rh-nothere1/path-bar')).status).toBe(404);
  });
});
