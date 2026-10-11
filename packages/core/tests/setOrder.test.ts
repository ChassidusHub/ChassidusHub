import { beforeEach, describe, expect, it } from 'vitest';
import { applyOrganize, catalogTree, linkedOfEach, linkedPage, pathBar, previewOrganize, type Catalog, type OrganizePlan } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

/**
 * A sefer's own place in each set it sits in (RFC 0002, #78): ordering one
 * set leaves the other as it was, in organize and in every list that shows
 * a set's items in order (catalog.children, the tree, linked pages, the
 * path bar's sefarim on a shelf).
 */

let catalog: Catalog;
let shelf: EntityId;
let series: EntityId;
let other: EntityId;
let a: EntityId;
let b: EntityId;
let c: EntityId;

const set = (slug: string, extra: Record<string, unknown> = {}) => ({ name: { he: slug, en: slug }, slug, policy: 'moderated', keepers: ['keeper'], ...extra });
const work = (slug: string, sets: EntityId[], order: string) => ({ title: { he: slug, en: slug }, slug, authors: [], genre: 'sichos', levels: ['sicha'], sets, order });

async function organize(plan: OrganizePlan) {
  const { suggestion } = await applyOrganize(catalog, 'mendy', plan);
  if ((await catalog.changeset(suggestion.id)).status === 'open') await catalog.merge(suggestion.id, 'steward');
}

const data = async (id: EntityId) => (await catalog.get(id))!.data as Record<string, any>;
const childrenIn = async (s: EntityId) => (await catalog.children(s, 'sets', 'work')).map((v) => v.id);

beforeEach(async () => {
  catalog = (await freshCatalog()).catalog;
  shelf = await add(catalog, 'steward', 'steward', 'set', set('shelf'), '/sets/shelf');
  series = await add(catalog, 'steward', 'steward', 'set', set('series', { parent: shelf }), '/sets/series');
  other = await add(catalog, 'steward', 'steward', 'set', set('other'), '/sets/other');
  // Three sefarim in both sets, a then b then c in each.
  a = await add(catalog, 'mendy', 'keeper', 'work', work('a', [shelf, series], 'V'), '/a');
  b = await add(catalog, 'mendy', 'keeper', 'work', work('b', [shelf, series], 'k'), '/b');
  c = await add(catalog, 'mendy', 'keeper', 'work', work('c', [shelf, series], 'r'), '/c');
});

describe('a sefer in two sets', () => {
  it('reordered in one set keeps its place in the other', async () => {
    await organize({ operations: [{ op: 'reorder', items: [c], parent: series, position: 'start' }] });
    expect(await childrenIn(series)).toEqual([c, a, b]);
    expect(await childrenIn(shelf)).toEqual([a, b, c]);
    // Its place in the series alone; its one order is as it was.
    expect(await data(c)).toMatchObject({ order: 'r', orderIn: { [series]: expect.any(String) } });
  });

  it('a sefer in one set is ordered by its one order, as before', async () => {
    const d = await add(catalog, 'mendy', 'keeper', 'work', work('d', [other], 'k'), '/d');
    const e = await add(catalog, 'mendy', 'keeper', 'work', work('e', [other], 'r'), '/e');
    await organize({ operations: [{ op: 'reorder', items: [e], parent: other, position: 'start' }] });
    expect(await childrenIn(other)).toEqual([e, d]);
    expect((await data(e)).orderIn).toBeUndefined();
  });

  it('every list of a set shows its own order: the tree, linked pages, the path bar', async () => {
    await organize({ operations: [{ op: 'reorder', items: [c], parent: series, position: 'start' }] });
    const tree = await catalogTree(catalog, { root: series });
    expect(tree.children.map((n) => n.id)).toEqual([c, a, b]);
    expect((await catalogTree(catalog, { root: shelf })).children.filter((n) => n.type === 'work').map((n) => n.id)).toEqual([a, b, c]);
    expect((await linkedPage(catalog.db, series, { field: 'sets', type: 'work' })).items.map((v) => v.id)).toEqual([c, a, b]);
    expect((await linkedPage(catalog.db, shelf, { field: 'sets', type: 'work' })).items.map((v) => v.id)).toEqual([a, b, c]);
    const each = await linkedOfEach(catalog.db, [series, shelf], { field: 'sets', type: 'work' });
    expect(each.get(series)!.map((v) => v.id)).toEqual([c, a, b]);
    expect(each.get(shelf)!.map((v) => v.id)).toEqual([a, b, c]);
    // The path bar offers the sefarim of the shelf the sefer is reached through (the series, inside the shelf), in that one's order.
    const bar = await pathBar(catalog, (await catalog.get(c))!);
    expect(bar!.find((level) => level.kind === 'work')!.choices.map((x) => x.id)).toEqual([c, a, b]);
  });

  it('moving out of a set drops its place there', async () => {
    await organize({ operations: [{ op: 'reorder', items: [c], parent: series, position: 'start' }] });
    await organize({ operations: [{ op: 'move', items: [c], from: series, to: other }] });
    const moved = await data(c);
    expect(moved.sets).not.toContain(series);
    expect(moved.orderIn?.[series]).toBeUndefined();
  });

  it('refuses a place in a set the item is not in', async () => {
    const cs = await catalog.createChangeset('mendy', { title: 'Bad place' });
    await catalog.putRevision(cs.id, 'mendy', { id: a, type: 'work', data: { ...(await data(a)), orderIn: { [other]: 'V' } } as never });
    const sent = await catalog.submit(cs.id, 'mendy');
    expect(sent.checks.filter((x) => x.status === 'fail').map((x) => x.message).join('; ')).toMatch(/orderIn has a place in .* not in that set/);
  });

  it('organize lists the siblings in the set asked for by its own order', async () => {
    await organize({ operations: [{ op: 'reorder', items: [c], parent: series, position: 'start' }] });
    // Put b first in the shelf: the series keeps c, a, b.
    const preview = await previewOrganize(catalog, { operations: [{ op: 'reorder', items: [b], parent: shelf, position: 'start' }] });
    expect(preview.items.map((i) => i.id)).toEqual([b]);
    await organize({ operations: [{ op: 'reorder', items: [b], parent: shelf, position: 'start' }] });
    expect(await childrenIn(shelf)).toEqual([b, a, c]);
    expect(await childrenIn(series)).toEqual([c, a, b]);
  });
});
