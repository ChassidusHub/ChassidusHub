import { describe, expect, it } from 'vitest';
import type { Json } from '@chassidushub/core';
import { newId } from '@chassidushub/model';
import { freshCatalog } from './helpers.js';

/**
 * Many items written to a suggestion at once (a machine transcript's
 * hundreds of paragraphs): the same versions putRevision would write, in
 * a few statements.
 */

const event = (set: string, i: number) => ({ kind: 'farbrengen', title: { he: `התוועדות ${i}` }, date: '5742-05-10', sets: [set] }) as unknown as Json;

describe('putRevisions', () => {
  it('writes new items, one pointing at another by an id given ahead, as putRevision would', async () => {
    const { catalog, set } = await freshCatalog();
    const one = await catalog.createChangeset('mendy', { title: 'One at a time' });
    const a = await catalog.putRevision(one.id, 'mendy', { type: 'event', data: event(set, 1) });
    const many = await catalog.createChangeset('mendy', { title: 'All at once' });
    const given = newId();
    const ids = await catalog.putRevisions(many.id, 'mendy', [
      { id: given, type: 'event', data: event(set, 1) },
      { type: 'event', data: { ...(event(set, 2) as object), title: { he: `אחרי ${given}` } } as Json },
    ]);
    expect(ids[0]).toBe(given);
    expect(ids).toHaveLength(2);
    const [x] = (await catalog.proposals(one.id)).filter((p) => p.entityId === a);
    const proposals = await catalog.proposals(many.id);
    expect(proposals.map((p) => p.entityId).sort()).toEqual([...ids].sort());
    expect(proposals.find((p) => p.entityId === given)!.rev.hash).toBe(x!.rev.hash);
    await catalog.submit(many.id, 'mendy');
    await catalog.merge(many.id, 'keeper');
    expect((await catalog.get(given))?.data).toMatchObject({ title: { he: 'התוועדות 1' } });
  });

  it('changes and deletes items already there, from the version the suggestion sees', async () => {
    const { catalog, set } = await freshCatalog();
    const setup = await catalog.createChangeset('mendy', { title: 'Setup' });
    const [a, b, c] = await catalog.putRevisions(setup.id, 'mendy', [1, 2, 3].map((i) => ({ type: 'event' as const, data: event(set, i) })));
    await catalog.submit(setup.id, 'mendy');
    await catalog.merge(setup.id, 'keeper');

    const cs = await catalog.createChangeset('mendy', { title: 'Change' });
    await catalog.putRevision(cs.id, 'mendy', { id: a!, type: 'event', data: event(set, 10) });
    await catalog.putRevisions(cs.id, 'mendy', [
      { id: a!, type: 'event', data: event(set, 11) }, // over the suggestion's own version
      { id: b!, type: 'event', data: null },
      { id: c!, type: 'event', data: event(set, 3) }, // no change: nothing written
    ]);
    const proposals = await catalog.proposals(cs.id);
    expect(proposals.map((p) => p.entityId).sort()).toEqual([a!, b!].sort());
    await catalog.submit(cs.id, 'mendy');
    await catalog.merge(cs.id, 'keeper');
    expect((await catalog.get(a!))?.data).toMatchObject({ title: { he: 'התוועדות 11' } });
    expect(await catalog.get(b!)).toBeNull();
  });

  it('refuses what putRevision refuses, writing nothing', async () => {
    const { catalog, set } = await freshCatalog();
    const cs = await catalog.createChangeset('mendy', { title: 'Bad' });
    await expect(catalog.putRevisions(cs.id, 'chaim', [{ type: 'event', data: event(set, 1) }])).rejects.toThrow(/author/);
    await expect(catalog.putRevisions(cs.id, 'mendy', [{ type: 'event', data: event(set, 1) }, { id: newId(), type: 'event', data: null }])).rejects.toThrow(/item/);
    expect(await catalog.proposals(cs.id)).toEqual([]);
  });
});
