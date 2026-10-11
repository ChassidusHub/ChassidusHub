import { beforeEach, describe, expect, it } from 'vitest';
import { Catalog, pathBar, type Json } from '@chassidushub/core';
import { measured } from '@chassidushub/db';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

const name = (he: string) => ({ he });

describe('the path bar', () => {
  let catalog: Catalog;
  let rebbe: EntityId, sichos: EntityId, ls: EntityId, sicha: EntityId;

  beforeEach(async () => {
    ({ catalog } = await freshCatalog());
    const set = (path: string, he: string, order: string, parent?: EntityId) =>
      add(catalog, 'steward', 'steward', 'set', { name: name(he), slug: path.split('/').pop()!, policy: 'moderated', keepers: [], order, ...(parent ? { parent } : {}) }, path);
    await set('/sets/alter-rebbe', 'אדמו"ר הזקן', 'a');
    rebbe = await set('/sets/the-rebbe', 'הרבי', 'b');
    const genre = await set('/sets/sichos', 'שיחות', 'c');
    const maamarim = await set('/sets/the-rebbe-maamarim', 'מאמרים', 'b', rebbe);
    sichos = await set('/sets/the-rebbe-sichos', 'שיחות', 'a', rebbe);
    const work = (path: string, he: string, sets: EntityId[], extra: Record<string, Json> = {}) =>
      add(catalog, 'steward', 'steward', 'work', { title: name(he), slug: path.slice(1), authors: [], genre: 'sichos', levels: ['volume', 'sicha'], sets, ...extra }, path);
    // A genre shelf first, the Rebbe's shelf second: the path goes through the shelf inside the Rebbe's.
    ls = await work('/likkutei-sichos', 'לקוטי שיחות', [genre, sichos], { order: 'a' });
    await work('/toras-menachem', 'תורת מנחם', [sichos], { order: 'b' });
    await work('/biurim', 'ביאורים', [sichos], { order: 'c', addition: { kind: 'commentary', to: ls } });
    await work('/melukat', 'מלוקט', [maamarim]);
    const unit = (volume: string, n: string, order: string) =>
      add(catalog, 'steward', 'steward', 'unit', { work: ls, position: [{ level: 'volume', value: volume, label: name(`חלק ${volume}`) }, { level: 'sicha', value: n }], order, label: name(`שיחה ${n}`) }, `/likkutei-sichos/${volume}/${n}`);
    await unit('1', '1', 'a');
    sicha = await unit('1', '2', 'b');
    await unit('2', '1', 'c');
  });

  it('gives a sicha its whole path, every level with the other choices there, in two statements', async () => {
    const db = measured(catalog.db);
    const item = (await catalog.get(sicha))!;
    const bar = await pathBar(new Catalog(db), item);
    expect(db.cost.statements).toBe(2);
    expect(bar!.map((l) => [l.kind, l.chosen.path ?? l.chosen.value])).toEqual([
      ['set', '/sets/the-rebbe'],
      ['set', '/sets/the-rebbe-sichos'],
      ['work', '/likkutei-sichos'],
      ['part', '/likkutei-sichos/1'],
      ['unit', '/likkutei-sichos/1/2'],
    ]);
    const [top, shelf, sefer, volume, unit] = bar!;
    // The top of the tree: every set with no parent, in the catalog's order (the starting catalog's Farbrengens has none).
    expect(top!.choices.map((c) => c.path)).toEqual(['/farbrengens', '/sets/alter-rebbe', '/sets/the-rebbe', '/sets/sichos']);
    expect(shelf!.choices.map((c) => c.path)).toEqual(['/sets/the-rebbe-sichos', '/sets/the-rebbe-maamarim']);
    // An addition to a sefer is on that sefer's page, not beside it.
    expect(sefer!.choices.map((c) => c.path)).toEqual(['/likkutei-sichos', '/toras-menachem']);
    expect(volume).toMatchObject({ level: 'volume', chosen: { value: '1', units: 2, name: { he: 'חלק 1' } } });
    expect(volume!.choices.map((c) => [c.path, c.units])).toEqual([
      ['/likkutei-sichos/1', 2],
      ['/likkutei-sichos/2', 1],
    ]);
    expect(unit).toMatchObject({ level: 'sicha', chosen: { id: sicha, name: { he: 'שיחה 2' } } });
    expect(unit!.choices.map((c) => c.path)).toEqual(['/likkutei-sichos/1/1', '/likkutei-sichos/1/2']);
  });

  it('ends a sefer\'s path at the sefer, and a shelf\'s at the shelf, in one statement', async () => {
    const db = measured(catalog.db);
    const work = await pathBar(new Catalog(db), (await catalog.get(ls))!);
    expect(db.cost.statements).toBe(1);
    expect(work!.map((l) => l.chosen.path)).toEqual(['/sets/the-rebbe', '/sets/the-rebbe-sichos', '/likkutei-sichos']);
    const shelf = await pathBar(catalog, (await catalog.get(sichos))!);
    expect(shelf!.map((l) => l.chosen.path)).toEqual(['/sets/the-rebbe', '/sets/the-rebbe-sichos']);
    const top = await pathBar(catalog, (await catalog.get(rebbe))!);
    expect(top!.map((l) => [l.chosen.path, l.choices.length])).toEqual([['/sets/the-rebbe', 4]]);
  });
});
