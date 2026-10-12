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

  it("counts a sefer's volumes by `part`, which the index holds, never by every row's position (#221)", async () => {
    const seen: string[] = [];
    const db = { ...catalog.db, query: (sql: string, params?: readonly unknown[]) => (seen.push(sql), catalog.db.query(sql, params)) } as typeof catalog.db;
    const bar = await pathBar(new Catalog(db), (await catalog.get(sicha))!);
    // Each volume's name is its first unit's label for it.
    expect(bar![3]!.choices.map((c) => c.name)).toEqual([{ he: 'חלק 1' }, { he: 'חלק 2' }]);
    const levels = seen.find((sql) => sql.includes('unit_place'))!;
    // Each unit_place row holds its sicha's lead (migration 0033): reading every row's position to find its volume read the whole table, 2 s cold on live.
    expect(levels).toContain('AND p.part = $');
    expect(levels).not.toMatch(/position->0->>'value'/);
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

  it("opens a page for every choice at every level, a part inside a volume at its first unit (#264)", async () => {
    // Likkutei Sichos 30-39: a volume, a parsha, a sicha, and the sicha's אותיות as the units; a sicha has no page of its own.
    const deep = await add(catalog, 'steward', 'steward', 'work', { title: name('לקוטי שיחות ל-לט'), slug: 'ls-deep', authors: [], genre: 'sichos', levels: ['volume', 'parsha', 'sicha', 'ois'], sets: [sichos], order: 'd' }, '/ls-deep');
    const units: EntityId[] = [];
    let n = 0;
    for (const [volume, parsha, sicha, oisos] of [['31', '1', '1', 3], ['31', '1', '2', 2], ['31', '2', '1', 2], ['32', '1', '1', 1]] as const) {
      for (let ois = 1; ois <= oisos; ois++) {
        const position: Json[] = [
          { level: 'volume', value: volume },
          { level: 'parsha', value: parsha },
          { level: 'sicha', value: sicha, label: name(`שיחה ${sicha}`) },
          { level: 'ois', value: String(ois) },
        ];
        units.push(await add(catalog, 'steward', 'steward', 'unit', { work: deep, position, order: String(n++).padStart(3, '0'), label: name(`${ois}`) }, `/ls-deep/${volume}/${parsha}/${sicha}/${ois}`));
      }
    }
    const bar = (await pathBar(catalog, (await catalog.get(units[1]!))!))!;
    const sichaLevel = bar.find((l) => l.level === 'sicha')!;
    expect(sichaLevel.choices.map((c) => c.path)).toEqual(['/ls-deep/31/1/1/1', '/ls-deep/31/1/2/1']);
    expect(bar.find((l) => l.level === 'parsha')!.choices.map((c) => c.path)).toEqual(['/ls-deep/31/1/1/1', '/ls-deep/31/2/1/1']);
    expect(bar.find((l) => l.level === 'volume')!.choices.map((c) => c.path)).toEqual(['/ls-deep/31', '/ls-deep/32']);

    // Walk every level of every unit's path bar, in this sefer and in Likkutei Sichos: each choice is an item's page,
    // or a volume (a sefer's path and one more word), which the site draws from the sefer.
    const volumes = new Set(['/likkutei-sichos', '/ls-deep']);
    const missing: string[] = [];
    for (const id of [...units, sicha]) {
      for (const level of (await pathBar(catalog, (await catalog.get(id))!))!) {
        for (const choice of level.choices) {
          const path = choice.path;
          if (!path) missing.push(`${level.kind} ${choice.value ?? choice.id}: no path`);
          else if (level.kind === 'part' && level.level === 'volume' && volumes.has(path.split('/').slice(0, -1).join('/'))) continue;
          else if (!(await catalog.resolvePath(path))) missing.push(path);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
