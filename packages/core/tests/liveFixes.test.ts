import { describe, expect, it } from 'vitest';
import { CatalogError, LIVE_FIX_LIMITS, mayFixLive, type Account, type Catalog } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

// RFC 0001: a few words fixed go live for anyone, bounded, and their author may undo them.

const body = (words: string) => ({ profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: words }] }] }] });

async function sicha(catalog: Catalog, policy: 'open' | 'moderated') {
  const set = await add(catalog, 'steward', 'steward', 'set', { name: { he: 'סט לדוגמה' }, slug: `sample-${policy}`, policy, keepers: ['keeper'] });
  const work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ספר לדוגמה' }, slug: `sample-${policy}`, authors: [], genre: 'sichos', levels: ['sicha'], sets: [set] });
  const unit = await add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'sicha', value: '1' }], order: 'V', label: { he: 'שיחה לדוגמה' }, body: body('מלים לדגומה כאן'), sets: [set] });
  return { set, work, unit };
}

async function fix(catalog: Catalog, by: string, unit: EntityId, change: (data: Record<string, unknown>) => Record<string, unknown>) {
  const current = (await catalog.get(unit))!.data as Record<string, unknown>;
  const cs = await catalog.createChangeset(by, { title: 'Fix a word' });
  await catalog.putRevision(cs.id, by, { id: unit, type: 'unit', data: change(current) as never });
  return catalog.submitFix(cs.id, by);
}

const wordsOf = async (catalog: Catalog, unit: EntityId) => ((await catalog.get(unit))!.data as { body: ReturnType<typeof body> }).body.versions[0]!.segments[0]!.text[0]!.text;

describe('small fixes that go live', () => {
  it("puts a contributor's word fix of a sefer's text live, on the keep-or-undo list", async () => {
    const { catalog } = await freshCatalog();
    const { unit } = await sicha(catalog, 'open');
    const result = await fix(catalog, 'mendy', unit, (d) => ({ ...d, body: body('מלים לדוגמה כאן') }));
    expect(result).toMatchObject({ live: true, reason: null, changeset: { status: 'merged', kind: 'live', post_review: 'pending' } });
    expect(await wordsOf(catalog, unit)).toBe('מלים לדוגמה כאן');
    expect((await catalog.listChangesets({ postReview: true })).map((c) => c.id)).toEqual([result.changeset.id]);
  });

  it('keeps for review a fix that changes more than the words, one in a moderated set, and a new account’s', async () => {
    const { catalog } = await freshCatalog();
    const { unit } = await sicha(catalog, 'open');
    const renamed = await fix(catalog, 'mendy', unit, (d) => ({ ...d, label: { he: 'שם אחר' }, body: body('מלים לדוגמה כאן') }));
    expect(renamed).toMatchObject({ live: false, changeset: { status: 'open' } });
    expect(renamed.reason).toMatch(/only the words/);

    const moderated = await sicha(catalog, 'moderated');
    const waits = await fix(catalog, 'mendy', moderated.unit, (d) => ({ ...d, body: body('מלים לדוגמה כאן') }));
    expect(waits).toMatchObject({ live: false, reason: 'this set reviews every change first' });

    // chaim signed up today and has no approved suggestion yet.
    const fresh = await fix(catalog, 'chaim', unit, (d) => ({ ...d, body: body('מלים לדוגמא כאן') }));
    expect(fresh.live).toBe(false);
    expect(fresh.reason).toMatch(/new account/);
  });

  it('counts a day of live fixes against the limit, and stewards have none', () => {
    const person: Account = { id: 'p', display_name: 'p', trust: 'contributor', is_steward: false, is_bot: false, approved_count: 3, reverted_count: 0, suspended_at: null };
    const change = { types: new Set(['unit']), sets: [{ id: 's', policy: 'open' as const, keepers: [] }], onlyWords: true };
    expect(mayFixLive(person, change, { accountAgeHours: 100, liveToday: LIVE_FIX_LIMITS.contributor - 1 }).ok).toBe(true);
    expect(mayFixLive(person, change, { accountAgeHours: 100, liveToday: LIVE_FIX_LIMITS.contributor })).toMatchObject({ ok: false, reason: 'limit' });
    expect(mayFixLive({ ...person, trust: 'trusted' }, change, { accountAgeHours: 100, liveToday: LIVE_FIX_LIMITS.contributor }).ok).toBe(true);
    expect(mayFixLive({ ...person, is_steward: true }, change, { accountAgeHours: 1, liveToday: 10_000 }).ok).toBe(true);
    expect(mayFixLive({ ...person, is_bot: true }, change, { accountAgeHours: 100, liveToday: 0 })).toMatchObject({ ok: false, reason: 'bot' });
    expect(mayFixLive(person, { ...change, types: new Set(['work']) }, { accountAgeHours: 100, liveToday: 0 })).toMatchObject({ ok: false, reason: 'kind' });
  });

  it('lets the author undo their live fix, once, without counting against them; others revert it on review', async () => {
    const { catalog } = await freshCatalog();
    const { unit } = await sicha(catalog, 'open');
    const { changeset } = await fix(catalog, 'mendy', unit, (d) => ({ ...d, body: body('מלים לדוגמה כאן') }));
    await expect(catalog.undoFix(changeset.id, 'chaim')).rejects.toMatchObject({ code: 'forbidden' });
    const undone = await catalog.undoFix(changeset.id, 'mendy');
    expect(undone.commit).toBeGreaterThan(0);
    expect(await wordsOf(catalog, unit)).toBe('מלים לדגומה כאן');
    expect((await catalog.account('mendy'))!.reverted_count).toBe(0);
    await expect(catalog.undoFix(changeset.id, 'mendy')).rejects.toBeInstanceOf(CatalogError);
  });

  it('does not undo a fix whose words someone changed since', async () => {
    const { catalog } = await freshCatalog();
    const { unit } = await sicha(catalog, 'open');
    const first = await fix(catalog, 'mendy', unit, (d) => ({ ...d, body: body('מלים לדוגמה כאן') }));
    const later = await catalog.createChangeset('keeper', { title: 'Another fix' });
    await catalog.putRevision(later.id, 'keeper', { id: unit, type: 'unit', data: { ...((await catalog.get(unit))!.data as Record<string, unknown>), body: body('מלים לדוגמה כאן בדיוק') } as never });
    await catalog.submit(later.id, 'keeper');
    await catalog.merge(later.id, 'steward');
    await expect(catalog.undoFix(first.changeset.id, 'mendy')).rejects.toThrow(/changed these words since/);
  });
});
