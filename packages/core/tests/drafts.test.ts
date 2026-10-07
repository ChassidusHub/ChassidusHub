import { beforeEach, describe, expect, it } from 'vitest';
import type { EntityId } from '@chassidushub/model';
import { getDraft, listDrafts, saveDraft, sendDraft, type Catalog, type Json } from '@chassidushub/core';
import { add, freshCatalog, yudShvat } from './helpers.js';

/** Your changes, not sent yet (drafts.ts): kept per page, sent together as one Suggestion. */

let catalog: Catalog;
let event: EntityId;

const body = { profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: 'בעשרה מאמרות נברא העולם' }] }, { id: 'p2', kind: 'paragraph', text: [{ text: 'וידועה הקושיא' }] }] }] };

beforeEach(async () => {
  const fresh = await freshCatalog();
  catalog = fresh.catalog;
  event = await add(catalog, 'mendy', 'keeper', 'event', { ...yudShvat(fresh.set), body } as unknown as Json);
});

const rename = (value: string, before?: string) => ({ key: `${event}:title.en`, op: 'set', says: 'Renamed the farbrengen', item: event, field: 'title.en', value, ...(before === undefined ? {} : { before }) });
const fixOf = () => ({ key: `${event}:he:p1`, op: 'words', says: 'Fixed a word in paragraph 1', item: event, change: 'edit', version: 'he', segment: 'p1', text: [{ text: 'בעשרה מאמרות נברא העולם.' }], before: [{ text: 'בעשרה מאמרות נברא העולם' }] });

describe('a draft', () => {
  it('is kept for its page, replaced whole each time, and forgotten when emptied', async () => {
    await saveDraft(catalog, 'chaim', { place: event, title: 'Yud Shvat 5742', ops: [rename('Yud Shvat')] });
    await saveDraft(catalog, 'chaim', { place: event, ops: [rename('Yud Shvat', 'Yud Shvat 5742'), fixOf()] });
    const kept = await getDraft(catalog, 'chaim', event);
    expect(kept?.title).toBe('Yud Shvat 5742');
    expect(kept?.ops.map((o) => o.says)).toEqual(['Renamed the farbrengen', 'Fixed a word in paragraph 1']);
    expect(await getDraft(catalog, 'mendy', event)).toBeNull();
    expect((await listDrafts(catalog, 'chaim')).map((d) => d.place)).toEqual([event]);
    await saveDraft(catalog, 'chaim', { place: event, ops: [] });
    expect(await getDraft(catalog, 'chaim', event)).toBeNull();
  });

  it('refuses what it cannot keep', async () => {
    await expect(saveDraft(catalog, 'chaim', { place: 'nowhere', ops: [] })).rejects.toThrow(/page's id/);
    await expect(saveDraft(catalog, 'chaim', { place: event, ops: [{ ...rename('x'), field: 'body' }] })).rejects.toThrow(/not changed this way/);
    await expect(saveDraft(catalog, 'chaim', { place: event, ops: [rename('x'), rename('y')] })).rejects.toThrow(/twice/);
    await expect(saveDraft(catalog, 'chaim', { place: event, ops: [{ ...rename('x'), says: '' }] })).rejects.toThrow(/says/);
  });
});

describe('sending a draft', () => {
  it('makes one Suggestion of every change, in order, and forgets the draft', async () => {
    await saveDraft(catalog, 'chaim', { place: event, ops: [rename('Yud Shvat', 'Yud Shvat 5742'), fixOf()] });
    const sent = await sendDraft(catalog, 'chaim', { place: event, note: 'Checked against the printed page' });
    expect(sent.title).toBe('Renamed the farbrengen and 1 more');
    expect(sent.description).toContain('Checked against the printed page');
    expect(sent.description).toContain('- Fixed a word in paragraph 1');
    const proposals = await catalog.proposals(sent.id);
    expect(proposals).toHaveLength(1);
    if (sent.status !== 'merged') await catalog.merge(sent.id, 'keeper');
    const after = (await catalog.get(event))!.data as { title: { en: string }; body: typeof body };
    expect(after.title.en).toBe('Yud Shvat');
    expect(after.body.versions[0]!.segments[0]!.text).toEqual([{ text: 'בעשרה מאמרות נברא העולם.' }]);
    expect(await getDraft(catalog, 'chaim', event)).toBeNull();
  });

  it('stops, naming the change, when someone changed that thing since, and keeps the draft', async () => {
    await saveDraft(catalog, 'chaim', { place: event, ops: [rename('Yud Shvat', 'Something else')] });
    await expect(sendDraft(catalog, 'chaim', { place: event })).rejects.toMatchObject({ code: 'conflict', detail: { key: `${event}:title.en` } });
    expect(await getDraft(catalog, 'chaim', event)).not.toBeNull();
  });

  it('names the change when its words no longer fit', async () => {
    await saveDraft(catalog, 'chaim', { place: event, ops: [{ ...fixOf(), before: [{ text: 'not what is there' }] }] });
    await expect(sendDraft(catalog, 'chaim', { place: event })).rejects.toMatchObject({ code: 'conflict', detail: { key: fixOf().key } });
  });

  it('has nothing to send without a draft', async () => {
    await expect(sendDraft(catalog, 'chaim', { place: event })).rejects.toThrow(/no changes/);
  });
});
