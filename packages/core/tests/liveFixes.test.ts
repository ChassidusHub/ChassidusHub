import { describe, expect, it } from 'vitest';
import { CatalogError, LIVE_FIX_LIMITS, mayFixLive, registerFile, scanText, sendFix, shapeOf, type Account, type Catalog, type FixJudge, type Json } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

// RFC 0001: a few words fixed go live for anyone, bounded, and their author may undo them.

const body = (words: string) => ({ profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: words }] }] }] });

async function sicha(catalog: Catalog, policy: 'open' | 'moderated', liveFixes?: boolean) {
  const slug = `sample-${policy}${liveFixes ? '-live' : ''}`;
  const set = await add(catalog, 'steward', 'steward', 'set', { name: { he: 'סט לדוגמה' }, slug, policy, keepers: ['keeper'], ...(liveFixes ? { liveFixes } : {}) });
  const work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ספר לדוגמה' }, slug, authors: [], genre: 'sichos', levels: ['sicha'], sets: [set] });
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

  it('puts a small fix live in a moderated set that takes them, and keeps its other changes for review', async () => {
    const { catalog } = await freshCatalog();
    const { unit } = await sicha(catalog, 'moderated', true);
    const live = await fix(catalog, 'mendy', unit, (d) => ({ ...d, body: body('מלים לדוגמה כאן') }));
    expect(live).toMatchObject({ live: true, reason: null, changeset: { status: 'merged', kind: 'live', post_review: 'pending' } });
    const renamed = await fix(catalog, 'mendy', unit, (d) => ({ ...d, label: { he: 'שם אחר' } }));
    expect(renamed).toMatchObject({ live: false, changeset: { status: 'open' } });
  });

  it('takes small fixes live only in open sets and moderated ones that say so, never in a locked one', () => {
    const person: Account = { id: 'p', display_name: 'p', trust: 'contributor', is_steward: false, is_bot: false, approved_count: 3, reverted_count: 0, suspended_at: null };
    const seen = { accountAgeHours: 100, liveToday: 0 };
    const change = (set: { policy: 'open' | 'moderated' | 'locked'; liveFixes?: boolean }) => ({ types: new Set(['unit']), sets: [{ id: 's', keepers: [], ...set }], onlyWords: true });
    expect(mayFixLive(person, change({ policy: 'open' }), seen).ok).toBe(true);
    expect(mayFixLive(person, change({ policy: 'moderated', liveFixes: true }), seen).ok).toBe(true);
    expect(mayFixLive(person, change({ policy: 'moderated' }), seen)).toMatchObject({ ok: false, reason: 'set' });
    expect(mayFixLive(person, change({ policy: 'locked', liveFixes: true }), seen)).toMatchObject({ ok: false, reason: 'set' });
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

describe('a live fix changes only the words (RFC 0001)', () => {
  const yes: FixJudge = async () => true;
  const styled = [{ text: 'מלים לדגומה כאן', marks: ['b'] }, { note: 'n1' }, { text: ' עוד' }];

  async function styledSicha(catalog: Catalog) {
    const { set, work } = await sicha(catalog, 'open');
    const unit = await add(catalog, 'mendy', 'keeper', 'unit', {
      work, position: [{ level: 'sicha', value: '2' }], order: 'W', label: { he: 'שיחה ב' }, sets: [set],
      body: { profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: styled }], notes: [{ id: 'n1', kind: 'note', text: [{ text: 'הערה' }] }] }] },
    } as unknown as Json);
    return { set, unit };
  }
  const runsOf = async (catalog: Catalog, unit: EntityId) => ((await catalog.get(unit))!.data as any).body.versions[0].segments[0].text;

  it('keeps for review a fix that adds a link, drops a note or changes the bold, and leaves the words as they were', async () => {
    const { catalog } = await freshCatalog();
    const { unit } = await styledSicha(catalog);
    const send = (after: unknown[]) => sendFix(catalog, 'mendy', { item: unit, segment: 'p1', before: styled as never, after: after as never }, { judge: yes, liveFixes: true });
    const link = await send([{ text: 'מלים לדוגמה כאן', marks: ['b'] }, { note: 'n1' }, { text: ' עוד', href: 'https://spam.example/buy' }]);
    const noNote = await send([{ text: 'מלים לדוגמה כאן', marks: ['b'] }, { text: ' עוד' }]);
    const plain = await send([{ text: 'מלים לדוגמה כאן' }, { note: 'n1' }, { text: ' עוד' }]);
    for (const result of [link, noNote, plain]) {
      expect(result).toMatchObject({ live: false, changeset: { status: 'open' } });
      expect(result.reason).toMatch(/more than the words/);
    }
    expect(await runsOf(catalog, unit)).toEqual(styled);
  });

  it('puts live a fix of the words alone, keeping the bold and the note', async () => {
    const { catalog } = await freshCatalog();
    const { unit } = await styledSicha(catalog);
    const after = [{ text: 'מלים לדוגמה כאן', marks: ['b'] }, { note: 'n1' }, { text: ' עוד' }];
    const result = await sendFix(catalog, 'mendy', { item: unit, segment: 'p1', before: styled as never, after: after as never }, { judge: yes, liveFixes: true });
    expect(result.live).toBe(true);
    expect(await runsOf(catalog, unit)).toEqual(after);
  });

  it('compares runs by their marks, links and inlines, not by how the words are split', () => {
    expect(shapeOf([{ text: 'א ' }, { text: 'ב' }])).toBe(shapeOf([{ text: 'א ב' }]));
    expect(shapeOf([{ text: 'א', marks: ['b', 'i'] }])).toBe(shapeOf([{ text: 'א', marks: ['i', 'b'] }]));
    expect(shapeOf([{ text: 'א', marks: [] }])).toBe(shapeOf([{ text: 'א' }]));
    expect(shapeOf([{ text: 'א' }, { br: true }])).not.toBe(shapeOf([{ text: 'א' }]));
  });

  it("leaves a machine's line on a scan unchecked when a fix of it goes live", async () => {
    const { catalog } = await freshCatalog();
    const { set } = await sicha(catalog, 'open');
    await registerFile(catalog.db, { sha256: 'a'.repeat(64), bytes: 10, mime: 'application/pdf', source: 'contribution', licence: 'cc0', held: true });
    const publication = await add(catalog, 'mendy', 'keeper', 'publication', { kind: 'book-volume', title: { he: 'כרך' }, sets: [set] });
    const scan = await add(catalog, 'mendy', 'keeper', 'scan', { publication, file: 'a'.repeat(64), completeness: 'complete', sets: [set] });
    await catalog.createAccount({ id: 'bot:ocr', displayName: 'Machine OCR', isBot: true });
    const cs = await catalog.createChangeset('bot:ocr', { title: 'OCR' });
    const layer = await catalog.putRevision(cs.id, 'bot:ocr', { type: 'text-layer', data: { scan, kind: 'machine-ocr', engine: { name: 'fake', version: '1' } } as Json });
    await catalog.putRevision(cs.id, 'bot:ocr', { type: 'text-layer', data: { scan, kind: 'community', seededFrom: layer } as Json });
    await catalog.putRevision(cs.id, 'bot:ocr', { type: 'text-page', data: { layer, page: 1, lines: [{ id: 'l1', text: 'מלים לדגומה כאן' }, { id: 'l2', text: 'שורה שנייה לדגומה' }], proofread: 0 } as unknown as Json });
    await catalog.submit(cs.id, 'bot:ocr');
    await catalog.merge(cs.id, 'steward');

    // The page's first fix makes the people's copy of the page: reviewed first. Even approved, the line is not checked.
    const first = await sendFix(catalog, 'mendy', { item: scan, segment: '1:l1', before: 'מלים לדגומה כאן', after: 'מלים לדוגמה כאן' }, { judge: yes, liveFixes: true });
    expect(first.live).toBe(false);
    await catalog.merge(first.changeset.id, 'keeper');
    const result = await sendFix(catalog, 'mendy', { item: scan, segment: '1:l2', before: 'שורה שנייה לדגומה', after: 'שורה שנייה לדוגמה' }, { judge: yes, liveFixes: true });
    expect(result).toMatchObject({ live: true, reason: null });
    expect((await scanText(catalog, scan, 1))!.lines).toMatchObject([
      { text: 'מלים לדוגמה כאן', level: 0, checked: false },
      { text: 'שורה שנייה לדוגמה', level: 0, checked: false },
    ]);
  });
});
