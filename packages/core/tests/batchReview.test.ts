import { beforeEach, describe, expect, it } from 'vitest';
import { applyOrganize, batchReview, type Catalog, type Json } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

/**
 * A catalog batch counted, sampled and listed (batchReview.ts), as the back
 * room's review queue shows a big one on a phone: how many of each kind of
 * change, where things go, a few samples, and the whole list a page at a time.
 */

let catalog: Catalog;
let sichos: EntityId;
let likkutei: EntityId;
let other: EntityId;
let units: EntityId[];

const work = (slug: string, sets: EntityId[]) => ({
  title: { he: slug, en: slug },
  slug,
  authors: [],
  genre: 'sichos',
  levels: ['sicha'],
  sets,
});
const unit = (w: EntityId, n: number, order: string): Record<string, Json> => ({
  work: w,
  position: [{ level: 'sicha', value: String(n) }],
  order,
  label: { he: `סיחה ${n}` },
});
const set = (slug: string) => ({
  name: { he: slug, en: slug },
  slug,
  policy: 'moderated',
  keepers: ['keeper'],
});
const body = (words: string, origin?: { by: string }) => ({
  profile: 'sichos-kodesh',
  versions: [
    {
      id: 'he',
      language: 'he',
      ...(origin ? { origin } : {}),
      segments: [
        { id: 'p1', kind: 'paragraph', text: [{ text: words }] },
        { id: 'p2', kind: 'paragraph', text: [{ text: 'ועוד' }] },
      ],
    },
  ],
});

beforeEach(async () => {
  ({ catalog } = await freshCatalog());
  sichos = await add(catalog, 'steward', 'steward', 'set', set('sichos'), '/sets/sichos');
  likkutei = await add(catalog, 'mendy', 'keeper', 'work', work('likkutei-sichos', [sichos]), '/likkutei-sichos');
  other = await add(catalog, 'mendy', 'keeper', 'work', work('other', [sichos]), '/other');
  units = [];
  for (let n = 1; n <= 12; n++) units.push(await add(catalog, 'mendy', 'keeper', 'unit', unit(likkutei, n, `a${String(n).padStart(2, '0')}`), `/likkutei-sichos/${n}`));
});

describe('a batch counted and listed', () => {
  it('counts the moves and says where they go', async () => {
    const { suggestion } = await applyOrganize(catalog, 'mendy', {
      operations: [{ op: 'move', items: units.slice(0, 8), to: other }],
    });
    const review = await batchReview(catalog, suggestion.id);
    expect(review.counts.moved).toBe(8);
    expect(review.flows[0]).toMatchObject({
      way: 'moved',
      from: { id: likkutei, name: 'likkutei-sichos' },
      to: { id: other, name: 'other' },
      count: 8,
    });
    const moved = review.samples.find((s) => s.kind === 'moved')!;
    expect(moved.items.length).toBe(5);
    // The first and the last are always among them.
    expect(moved.items[0]!.name).toBe('סיחה 1');
    expect(moved.items.at(-1)!.name).toBe('סיחה 8');
  });

  it('says a rename with what it was, and a merge with where it goes', async () => {
    const { suggestion } = await applyOrganize(catalog, 'mendy', {
      operations: [
        { op: 'rename', item: units[0]!, name: { he: 'שיחת פרשת בראשית' } },
        { op: 'merge', from: other, into: likkutei },
      ],
    });
    const review = await batchReview(catalog, suggestion.id);
    expect(review.counts.renamed).toBe(1);
    expect(review.counts.merged).toBe(1);
    const all = review.list.rows;
    expect(all.find((i) => i.id === units[0])).toMatchObject({
      kinds: ['renamed'],
      name: 'שיחת פרשת בראשית',
      was: 'סיחה 1',
    });
    expect(all.find((i) => i.id === other)).toMatchObject({
      kinds: ['merged'],
      into: { id: likkutei },
    });
  });

  it('says changed facts, new items, deleted ones and words added', async () => {
    const cs = await catalog.createChangeset('mendy', { title: 'Letters' });
    await catalog.putRevision(cs.id, 'mendy', {
      id: units[1]!,
      type: 'unit',
      data: {
        ...unit(likkutei, 2, 'a02'),
        position: [{ level: 'sicha', value: '22' }],
      },
    });
    await catalog.putRevision(cs.id, 'mendy', {
      id: units[2]!,
      type: 'unit',
      data: { ...unit(likkutei, 3, 'a03'), body: body('ב"ה, י"ט סיון תשי"ב') },
    });
    await catalog.putRevision(cs.id, 'mendy', {
      id: units[3]!,
      type: 'unit',
      data: null,
    });
    await catalog.putRevision(cs.id, 'mendy', {
      id: units[4]!,
      type: 'unit',
      data: {
        ...unit(likkutei, 5, 'a05'),
        body: body('מכתב', { by: 'pdf-text:otzros' }),
      },
    });
    await catalog.putRevision(cs.id, 'mendy', {
      type: 'unit',
      data: unit(other, 1, 'a01'),
      path: '/other/1',
    });
    const review = await batchReview(catalog, cs.id);
    expect(review.counts).toEqual({
      relabelled: 1,
      words: 2,
      deleted: 1,
      new: 1,
    });
    const rows = review.list.rows;
    expect(rows.find((i) => i.id === units[1])!.facts).toEqual([
      {
        field: 'position',
        before: JSON.stringify([{ level: 'sicha', value: '2' }]),
        after: JSON.stringify([{ level: 'sicha', value: '22' }]),
      },
    ]);
    expect(rows.find((i) => i.id === units[2])!.words).toEqual({
      paragraphs: 2,
      first: 'ב"ה, י"ט סיון תשי"ב ועוד',
      added: true,
      machine: false,
    });
    // Read by a machine and not checked: said so, and counted.
    expect(rows.find((i) => i.id === units[4])!.words!.machine).toBe(true);
    expect(review.machine).toBe(1);
    expect(rows.find((i) => i.id === units[3])).toMatchObject({
      kinds: ['deleted'],
      from: { id: likkutei },
    });
    expect(rows.find((i) => i.kinds.includes('new'))).toMatchObject({
      to: { id: other },
    });
  });

  it('pages and searches the list, and keeps to one kind', async () => {
    const { suggestion } = await applyOrganize(catalog, 'mendy', {
      operations: [
        { op: 'move', items: units.slice(0, 10), to: other },
        { op: 'rename', item: units[11]!, name: { he: 'שיחת פרשת נח' } },
      ],
    });
    const page = await batchReview(catalog, suggestion.id, {
      limit: 4,
      offset: 4,
    });
    expect(page.list.total).toBe(11);
    // In the order of their paths: /likkutei-sichos/12 (renamed) first, then the moved ones in /other.
    expect(page.list.rows.map((r) => r.name)).toEqual(['סיחה 4', 'סיחה 5', 'סיחה 6', 'סיחה 7']);
    expect((await batchReview(catalog, suggestion.id, { kind: 'renamed' })).list.rows.map((r) => r.name)).toEqual(['שיחת פרשת נח']);
    // Search reads as search writes: quotes are forgiven.
    expect((await batchReview(catalog, suggestion.id, { q: 'נ"ח' })).list.total).toBe(1);
    expect((await batchReview(catalog, suggestion.id, { q: 'פרשת סיחה' })).list.total).toBe(1);
  });
});
