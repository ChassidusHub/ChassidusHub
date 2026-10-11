import { beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

/**
 * Search's filters (#72): an author, a set, a topic, a language and a
 * sefer, each narrowing what the words found, and combining. An item
 * counts when it says so itself or when its sefer does; a set counts with
 * the sets under it, a topic with the narrower topics under it. The words
 * are made up.
 */

let catalog: Catalog;
const ids: Record<string, EntityId> = {};

const set = (slug: string, extra: Record<string, unknown> = {}) => ({ name: { he: slug }, slug, policy: 'moderated', keepers: ['keeper'], ...extra });
const work = (he: string, slug: string, extra: Record<string, unknown>) => ({ title: { he, en: slug }, slug, genre: 'chassidus', levels: ['chapter'], ...extra });
const unit = (work: EntityId, n: number, extra: Record<string, unknown> = {}) => ({ work, position: [{ level: 'chapter', value: String(n) }], order: `a${n}`, label: { he: `זזזג פרק ${n}` }, ...extra });

const found = async (filters: Parameters<Catalog['search']>[1]) => (await catalog.search('זזזג', { limit: 50, ...filters })).map((r) => r.id).sort();
const of = (...names: string[]) => names.map((n) => ids[n]!).sort();

beforeEach(async () => {
  catalog = (await freshCatalog()).catalog;
  ids.shelf = await add(catalog, 'steward', 'steward', 'set', set('shelf'), '/sets/shelf');
  ids.child = await add(catalog, 'steward', 'steward', 'set', set('child', { parent: ids.shelf }), '/sets/child');
  ids.elsewhere = await add(catalog, 'steward', 'steward', 'set', set('elsewhere'), '/sets/elsewhere');
  ids.a = await add(catalog, 'steward', 'steward', 'author', { name: { he: 'מחבר א' }, kind: 'rebbe' });
  ids.b = await add(catalog, 'steward', 'steward', 'author', { name: { he: 'מחבר ב' }, kind: 'rebbe' });
  ids.topic = await add(catalog, 'mendy', 'keeper', 'topic', { name: { he: 'נושא רחב' }, sets: [ids.shelf] });
  ids.narrower = await add(catalog, 'mendy', 'keeper', 'topic', { name: { he: 'נושא צר' }, broader: ids.topic, sets: [ids.shelf] });
  ids.w1 = await add(catalog, 'mendy', 'keeper', 'work', work('זזזג ספר אחד', 'one', { authors: [ids.a], sets: [ids.child], topics: [ids.narrower] }), '/one');
  ids.w2 = await add(catalog, 'mendy', 'keeper', 'work', work('זזזג ספר שני', 'two', { authors: [ids.b], sets: [ids.elsewhere], sourceCopies: [{ kind: 'text', source: 'sefaria', licence: 'cc0', language: 'en', sourceId: 'Example' }] }), '/two');
  ids.u1 = await add(catalog, 'mendy', 'keeper', 'unit', unit(ids.w1, 1));
  ids.u2 = await add(catalog, 'mendy', 'keeper', 'unit', unit(ids.w2, 2));
  ids.u3 = await add(catalog, 'mendy', 'keeper', 'unit', unit(ids.w2, 3, { topics: [ids.topic] }));
});

describe('search filters', () => {
  it('finds everything with no filter', async () => {
    expect(await found({})).toEqual(of('w1', 'w2', 'u1', 'u2', 'u3'));
  });

  it("an author: the sefarim he wrote and their items", async () => {
    expect(await found({ author: ids.a })).toEqual(of('w1', 'u1'));
    expect(await found({ author: ids.b })).toEqual(of('w2', 'u2', 'u3'));
  });

  it('a set: what is in it or the sets under it, or whose sefer is', async () => {
    expect(await found({ set: ids.shelf })).toEqual(of('w1', 'u1'));
    expect(await found({ set: ids.child })).toEqual(of('w1', 'u1'));
    expect(await found({ set: ids.elsewhere })).toEqual(of('w2', 'u2', 'u3'));
  });

  it('a topic: on it or a narrower one, itself or through its sefer', async () => {
    expect(await found({ topic: ids.topic })).toEqual(of('w1', 'u1', 'u3'));
    expect(await found({ topic: ids.narrower })).toEqual(of('w1', 'u1'));
  });

  it("a language: what says it is in it, a sicha by its sefer's; Hebrew also what names none", async () => {
    expect(await found({ language: 'en' })).toEqual(of('w2', 'u2', 'u3'));
    expect(await found({ language: 'he' })).toEqual(of('w1', 'u1'));
    expect(await found({ language: 'yi' })).toEqual([]);
  });

  it('the filters combine: each narrows the others', async () => {
    expect(await found({ topic: ids.topic, language: 'he' })).toEqual(of('w1', 'u1'));
    expect(await found({ topic: ids.topic, language: 'en' })).toEqual(of('u3'));
    expect(await found({ topic: ids.topic, author: ids.b })).toEqual(of('u3'));
    expect(await found({ work: ids.w2, topic: ids.topic })).toEqual(of('u3'));
    expect(await found({ set: ids.shelf, author: ids.b })).toEqual([]);
  });
});
