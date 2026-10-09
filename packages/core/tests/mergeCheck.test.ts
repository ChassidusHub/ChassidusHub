import { beforeEach, describe, expect, it } from 'vitest';
import { proposeClashResolutions, readClashAnswer, UnresolvedConflictError, type Advisor, type Catalog, type MergeClash } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog, yudShvat } from './helpers.js';

/**
 * Merging with care: the check before Approve (clashes field by field,
 * what would stop the merge, links left pointing at nothing, other
 * suggestions on the same items), bringing a suggestion up to date, the
 * stages a list shows, and the machine's proposals for clashes, which a
 * person accepts.
 */

let catalog: Catalog;
let set: EntityId;

beforeEach(async () => {
  const fresh = await freshCatalog();
  catalog = fresh.catalog;
  set = fresh.set;
});

/** A suggestion by `by` that changes the event to `data`, sent for review. */
async function change(by: string, id: EntityId, data: Record<string, unknown>) {
  const cs = await catalog.createChangeset(by, { title: 'A fix' });
  await catalog.putRevision(cs.id, by, { id, type: 'event', data: data as never });
  await catalog.submit(cs.id, by);
  return cs.id;
}

describe('the merge check', () => {
  it('says a clean suggestion is ready, and who may approve it', async () => {
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    const id = await change('mendy', event, { ...yudShvat(set), date: '5742-05-11' });
    const check = await catalog.mergeCheck(id, 'keeper');
    expect(check).toMatchObject({ stage: 'ready', ready: true, mayApprove: true, items: 1, behind: 0, clashes: [], problems: [], overlaps: [] });
    expect((await catalog.mergeCheck(id, 'mendy')).mayApprove).toBe(false);
    expect((await catalog.mergeCheck(id, null)).mayApprove).toBeNull();
  });

  it('names the other suggestions on the same items, then the fields that clash once one is merged', async () => {
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    const first = await change('mendy', event, { ...yudShvat(set), date: '5742-05-11' });
    const second = await change('chaim', event, { ...yudShvat(set), date: '5742-05-12', title: { he: 'יו״ד שבט', en: 'Yud Shvat' } });
    expect((await catalog.mergeCheck(second, 'keeper')).overlaps).toEqual([expect.objectContaining({ id: first, shared: 1 })]);
    expect((await catalog.mergeStages([first, second])).get(second)).toEqual({ items: 1, behind: 0, overlaps: 1, blocked: false });

    await catalog.merge(first, 'keeper');
    const check = await catalog.mergeCheck(second, 'keeper');
    expect(check).toMatchObject({ stage: 'clashes', ready: false, behind: 1, overlaps: [] });
    // The title changed on one side only, so it merges by itself; the date is the clash.
    expect(check.clashes).toEqual([{ entityId: event, type: 'event', path: '/date', base: '5742-05-10', ours: '5742-05-11', theirs: '5742-05-12', decided: null }]);
    expect((await catalog.mergeStages([second])).get(second)).toMatchObject({ behind: 1, overlaps: 0 });

    const decided = await catalog.mergeCheck(second, 'keeper', { [event]: { '/date': { value: '5742-05-13' } } });
    expect(decided).toMatchObject({ stage: 'ready', ready: true });
    expect(decided.clashes[0]!.decided).toEqual({ value: '5742-05-13' });
    await catalog.merge(second, 'keeper', { [event]: { '/date': { value: '5742-05-13' } } });
    expect((await catalog.get(event))!.data).toMatchObject({ date: '5742-05-13', title: { en: 'Yud Shvat' } });
    expect(await catalog.mergeCheck(second, 'keeper')).toMatchObject({ stage: 'merged', merged: { commit: expect.any(Number) } });
  });

  it('finds what would stop the merge, and links it would leave pointing at nothing', async () => {
    const work = await add(catalog, 'steward', 'steward', 'work', { title: { he: 'לקוטי שיחות' }, slug: 'likkutei-sichos', authors: [], genre: 'sichos', levels: ['volume', 'sicha'], sets: [set] });
    const deleting = await catalog.createChangeset('mendy', { title: 'Take it out' });
    await catalog.putRevision(deleting.id, 'mendy', { id: work, type: 'work', data: null });
    await catalog.submit(deleting.id, 'mendy');
    const unit = await add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'volume', value: '1' }, { level: 'sicha', value: '1' }], order: 'V', label: { he: 'חלק א, שיחה א' } });
    expect((await catalog.mergeCheck(deleting.id, 'steward')).dangling).toEqual([{ from: unit, field: 'work', to: work }]);

    const pointing = await catalog.createChangeset('mendy', { title: 'A sicha of it' });
    await catalog.putRevision(pointing.id, 'mendy', { type: 'unit', data: { work, position: [{ level: 'volume', value: '1' }, { level: 'sicha', value: '2' }], order: 'W', label: { he: 'חלק א, שיחה ב' } } });
    await catalog.submit(pointing.id, 'mendy');
    await catalog.merge(deleting.id, 'steward');
    const check = await catalog.mergeCheck(pointing.id, 'keeper');
    expect(check.stage).toBe('blocked');
    expect(check.problems).toEqual([expect.objectContaining({ kind: 'reference', message: expect.stringContaining('not in the catalog') })]);
    await expect(catalog.merge(pointing.id, 'steward')).rejects.toThrow(/not in the catalog/);
  });
});

describe('bringing a suggestion up to date', () => {
  it("takes in the site's changes to other fields by itself", async () => {
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    const first = await change('mendy', event, { ...yudShvat(set), date: '5742-05-11' });
    const second = await change('chaim', event, { ...yudShvat(set), title: { he: 'יו״ד שבט', en: 'Yud Shvat' } });
    await catalog.merge(first, 'keeper');
    expect((await catalog.mergeCheck(second, 'keeper')).behind).toBe(1);
    await expect(catalog.bringUpToDate(second, 'mendy')).rejects.toThrow(/author or a steward/);
    expect(await catalog.bringUpToDate(second, 'chaim')).toEqual({ updated: 1 });
    expect(await catalog.mergeCheck(second, 'keeper')).toMatchObject({ behind: 0, clashes: [], stage: 'ready' });
    // What it changes now is only its own fix.
    const review = await catalog.review(second);
    expect(review.entries[0]!.changes.map((c) => c.path)).toEqual(['/title/en', '/title/he']);
    expect(await catalog.bringUpToDate(second, 'chaim')).toEqual({ updated: 0 });
    await catalog.merge(second, 'keeper');
    expect((await catalog.get(event))!.data).toMatchObject({ date: '5742-05-11', title: { en: 'Yud Shvat' } });
  });

  it('writes nothing until every clash is settled', async () => {
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    const first = await change('mendy', event, { ...yudShvat(set), date: '5742-05-11' });
    const second = await change('chaim', event, { ...yudShvat(set), date: '5742-05-12' });
    await catalog.merge(first, 'keeper');
    await expect(catalog.bringUpToDate(second, 'chaim')).rejects.toBeInstanceOf(UnresolvedConflictError);
    expect((await catalog.mergeCheck(second, 'keeper')).stage).toBe('clashes');
    expect(await catalog.bringUpToDate(second, 'chaim', { '*': { '*': { take: 'theirs' } } })).toEqual({ updated: 1 });
    const check = await catalog.mergeCheck(second, 'keeper');
    expect(check).toMatchObject({ stage: 'ready', clashes: [], behind: 0 });
    const { rows } = await catalog.db.query<{ kind: string; detail: { upToDate?: number } }>("SELECT kind, detail FROM thread_event WHERE thread_kind = 'changeset' AND thread_id = $1 AND kind = 'edited'", [second]);
    expect(rows.map((r) => r.detail.upToDate)).toEqual([1]);
    await catalog.merge(second, 'keeper');
    expect((await catalog.get(event))!.data).toMatchObject({ date: '5742-05-12' });
  });
});

describe("the machine's proposals for clashes", () => {
  const clash: MergeClash = { entityId: 'rh-00000001', type: 'event', path: '/date', base: '5742-05-10', ours: '5742-05-11', theirs: '5742-05-12', decided: null };

  it('reads an answer strictly', () => {
    expect(readClashAnswer('{"take":"site","why":"The site has the later fix."}', clash, false)).toEqual({ entityId: 'rh-00000001', path: '/date', resolution: { take: 'ours' }, why: 'The site has the later fix.' });
    expect(readClashAnswer('Sure: {"take":"suggestion","why":"x"}', clash, false)?.resolution).toEqual({ take: 'theirs' });
    expect(readClashAnswer('{"take":"both","value":"5742-05-13","why":"x"}', clash, false)?.resolution).toEqual({ value: '5742-05-13' });
    // A value of another kind, a value where the field was cut short, or no JSON at all: no proposal.
    expect(readClashAnswer('{"take":"both","value":5,"why":"x"}', clash, false)).toBeNull();
    expect(readClashAnswer('{"take":"both","value":"x","why":"x"}', clash, true)).toBeNull();
    expect(readClashAnswer('I think the site', clash, false)).toBeNull();
  });

  it('asks about the clashes no decision settles, and proposes', async () => {
    const asked: string[] = [];
    const advisor: Advisor = {
      model: 'test-model',
      async complete(_system, user) {
        asked.push(user);
        return '{"take":"suggestion","why":"The suggestion has the date in the printing."}';
      },
    };
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    const first = await change('mendy', event, { ...yudShvat(set), date: '5742-05-11' });
    const second = await change('chaim', event, { ...yudShvat(set), date: '5742-05-12' });
    await catalog.merge(first, 'keeper');
    const result = await proposeClashResolutions(catalog, advisor, await catalog.mergeCheck(second, 'keeper'));
    expect(result).toMatchObject({ asked: 1, left: 0, model: 'test-model', proposals: [{ entityId: event, path: '/date', resolution: { take: 'theirs' } }] });
    expect(asked[0]).toContain('site: "5742-05-11"');
    const none = await proposeClashResolutions(catalog, advisor, await catalog.mergeCheck(second, 'keeper', { '*': { '*': { take: 'ours' } } }));
    expect(none.asked).toBe(0);
  });
});
