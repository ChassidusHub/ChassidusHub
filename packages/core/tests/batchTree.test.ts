import { beforeEach, describe, expect, it } from 'vitest';
import { applyOrganize, batchTree, foldTreeRows, type BatchTreeGroup, type BatchTreeLine, type BatchTreeRow, type Catalog } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

/**
 * A catalog batch's tree before and after (batchTree.ts), as the back
 * room's review queue draws it: each parent the batch changes, its children
 * now and once approved, marked.
 */

let catalog: Catalog;
let shelf: EntityId;
let sichos: EntityId;
let likkutei: EntityId;
let other: EntityId;
let units: EntityId[];

const work = (slug: string, sets: EntityId[]) => ({ title: { he: slug, en: slug }, slug, authors: [], genre: 'sichos', levels: ['sicha'], sets });
const unit = (w: EntityId, n: number, order: string) => ({ work: w, position: [{ level: 'sicha', value: String(n) }], order, label: { he: `סיחה ${n}` } });
const set = (slug: string) => ({ name: { he: slug, en: slug }, slug, policy: 'moderated', keepers: ['keeper'] });

const rows = (lines: BatchTreeLine[]) => lines.filter((l): l is BatchTreeRow => 'id' in l);
const marks = (lines: BatchTreeLine[]) => rows(lines).map((r) => `${r.name}:${r.mark}`);
const group = (groups: BatchTreeGroup[], parent: EntityId) => groups.find((g) => g.parent.id === parent)!;

beforeEach(async () => {
  const fresh = await freshCatalog();
  catalog = fresh.catalog;
  shelf = fresh.set;
  sichos = await add(catalog, 'steward', 'steward', 'set', set('sichos'), '/sets/sichos');
  likkutei = await add(catalog, 'mendy', 'keeper', 'work', work('likkutei-sichos', [sichos]), '/likkutei-sichos');
  other = await add(catalog, 'mendy', 'keeper', 'work', work('other', [sichos]), '/other');
  units = [];
  for (const [n, order] of [[1, 'V'], [2, 'k'], [3, 'r']] as const) units.push(await add(catalog, 'mendy', 'keeper', 'unit', unit(likkutei, n, order), `/likkutei-sichos/${n}`));
});

describe('a batch drawn as a tree', () => {
  it('shows a sicha leaving one sefer and arriving in another', async () => {
    const { suggestion } = await applyOrganize(catalog, 'mendy', { operations: [{ op: 'move', items: [units[1]!], to: other }] });
    const tree = await batchTree(catalog, suggestion.id);
    expect(tree.items).toBe(1);
    expect(tree.elsewhere).toBe(0);
    const from = group(tree.groups, likkutei);
    expect(from.parent.name).toBe('likkutei-sichos');
    expect(marks(from.before)).toEqual(['סיחה 1:same', 'סיחה 2:out', 'סיחה 3:same']);
    expect(marks(from.after)).toEqual(['סיחה 1:same', 'סיחה 3:same']);
    expect(from.counts).toEqual({ before: 3, after: 2 });
    const to = group(tree.groups, other);
    expect(marks(to.before)).toEqual([]);
    expect(marks(to.after)).toEqual(['סיחה 2:in']);
  });

  it('shows a renamed sicha in its place, with what it was called', async () => {
    const { suggestion } = await applyOrganize(catalog, 'mendy', { operations: [{ op: 'rename', item: units[0]!, name: { he: 'שיחת פרשת בראשית' } }] });
    const tree = await batchTree(catalog, suggestion.id);
    const g = group(tree.groups, likkutei);
    expect(rows(g.after)[0]).toMatchObject({ name: 'שיחת פרשת בראשית', mark: 'renamed', was: 'סיחה 1' });
  });

  it('shows a sicha put in another place among its neighbours', async () => {
    const { suggestion } = await applyOrganize(catalog, 'mendy', { operations: [{ op: 'reorder', items: [units[2]!], position: 'start' }] });
    const tree = await batchTree(catalog, suggestion.id);
    const g = group(tree.groups, likkutei);
    expect(marks(g.after)).toEqual(['סיחה 3:moved', 'סיחה 1:same', 'סיחה 2:same']);
  });

  it('shows a sefer moved between shelves', async () => {
    const { suggestion } = await applyOrganize(catalog, 'mendy', { operations: [{ op: 'move', items: [other], from: sichos, to: shelf }] });
    const tree = await batchTree(catalog, suggestion.id);
    expect(marks(group(tree.groups, sichos).before)).toEqual(['likkutei-sichos:same', 'other:out']);
    expect(marks(group(tree.groups, shelf).after)).toContain('other:in');
  });

  it('draws only the parents a batch touches', async () => {
    const { suggestion } = await applyOrganize(catalog, 'mendy', { operations: [{ op: 'move', items: [units[0]!], to: other }] });
    const tree = await batchTree(catalog, suggestion.id);
    expect(tree.groups.length).toBe(2);
  });
});

describe('folding', () => {
  const row = (n: number, mark: BatchTreeRow['mark'] = 'same'): BatchTreeRow => ({ id: `rh-${n}` as EntityId, type: 'unit', name: String(n), path: null, mark });
  it('keeps each change with a neighbour on each side, and the ends', () => {
    const list = Array.from({ length: 20 }, (_, i) => row(i, i === 10 ? 'in' : 'same'));
    expect(foldTreeRows(list).map((l) => ('gap' in l ? `…${l.gap}` : l.name))).toEqual(['0', '…8', '9', '10', '11', '…7', '19']);
  });
  it('folds a long run of one mark into a count of it', () => {
    const list = Array.from({ length: 30 }, (_, i) => row(i, 'in'));
    const folded = foldTreeRows(list);
    expect(folded).toHaveLength(6);
    expect(folded[3]).toEqual({ gap: 25, mark: 'in' });
  });
});
