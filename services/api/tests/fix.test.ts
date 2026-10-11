import { beforeEach, describe, expect, it } from 'vitest';
import type { Catalog, FixJudge } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { createApp } from '../src/app.js';
import { workersAiFixJudge } from '../src/fixes.js';
import { add, freshCatalog, yudShvat } from '../../../packages/core/tests/helpers.js';

/** POST /v1/fix and its undo (RFC 0001): one way to fix words in any text; small fixes go live after the AI check. */

let catalog: Catalog;
let unit: EntityId;
let recording: EntityId;
let paragraph: EntityId;
let asked: Array<{ before: string; after: string }>;

beforeEach(async () => {
  catalog = (await freshCatalog()).catalog;
  const open = await add(catalog, 'steward', 'steward', 'set', { name: { he: 'סט לדוגמה' }, slug: 'sample', policy: 'open', keepers: ['keeper'] });
  const work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ספר לדוגמה' }, slug: 'sample', authors: [], genre: 'sichos', levels: ['sicha'], sets: [open] });
  const body = { profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: 'מלים לדגומה כאן' }], origin: { by: 'ocr:fake@1' } }] }] };
  unit = await add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'sicha', value: '1' }], order: 'V', label: { he: 'שיחה לדוגמה' }, body, sets: [open] });
  const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(open));
  recording = await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק א' }, url: 'https://example.org/a.mp3', sets: [open] });
  const text = await add(catalog, 'mendy', 'keeper', 'text', { kind: 'transcript', recording, language: 'yi' });
  paragraph = await add(catalog, 'mendy', 'keeper', 'segment', { text, order: 'V', kind: 'paragraph', content: 'א פאראגראף לדגומה', proofread: 0, origin: { by: 'transcribe:fake@1' } });
  asked = [];
});

const appWith = (verdict: boolean | null, liveFixes = true) => {
  const judge: FixJudge = async (change) => (asked.push(change), verdict);
  return createApp({ catalog, authenticate: (c) => c.req.header('X-Test-Account') ?? null, fixJudge: judge, liveFixes });
};

const call = async (app: ReturnType<typeof createApp>, path: string, body: unknown, as = 'mendy') => {
  const response = await app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Account': as }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as any };
};

const words = async () => ((await catalog.get(unit))!.data as any).body.versions[0].segments[0];

describe('POST /v1/fix', () => {
  it("puts a sefer's word fix live after the check says yes, marked edited not checked, and its author undoes it", async () => {
    const app = appWith(true);
    const { status, body } = await call(app, '/v1/fix', { item: unit, segment: 'p1', before: 'מלים לדגומה כאן', after: 'מלים לדוגמה כאן' });
    expect(status).toBe(201);
    expect(body).toMatchObject({ live: true, undo: `/v1/fix/${body.changeset}/undo` });
    expect(asked).toEqual([{ before: 'מלים לדגומה כאן', after: 'מלים לדוגמה כאן' }]);
    expect(await words()).toMatchObject({ text: [{ text: 'מלים לדוגמה כאן' }], origin: { by: 'ocr:fake@1', edited: true } });
    expect((await words()).origin.checked).toBeUndefined();

    expect((await call(app, body.undo, {})).status).toBe(201);
    expect((await words()).text).toEqual([{ text: 'מלים לדגומה כאן' }]);
    expect((await call(app, body.undo, {})).status).toBe(409);
  });

  it("fixes a transcript's paragraph the same way, as its own suggestion", async () => {
    const { body } = await call(appWith(true), '/v1/fix', { item: recording, segment: paragraph, before: 'א פאראגראף לדגומה', after: 'א פאראגראף לדוגמה' });
    expect(body.live).toBe(true);
    expect((await catalog.get(paragraph))!.data).toMatchObject({ content: 'א פאראגראף לדוגמה', origin: { edited: true } });
  });

  it('keeps a fix for review when the check says no or cannot say, when it is large, or when live fixes are off', async () => {
    const no = await call(appWith(false), '/v1/fix', { item: unit, segment: 'p1', before: 'מלים לדגומה כאן', after: 'מלים אחרות לגמרי' });
    expect(no.body).toMatchObject({ live: false, reason: 'the automatic check asked for a reviewer to look' });
    const unsure = await call(appWith(null), '/v1/fix', { item: recording, segment: paragraph, before: 'א פאראגראף לדגומה', after: 'א פאראגראף לדוגמה' });
    expect(unsure.body).toMatchObject({ live: false });
    asked = [];
    const large = await call(appWith(true), '/v1/fix', { item: recording, segment: paragraph, before: 'א פאראגראף לדגומה', after: 'א ב ג ד ה ו ז ח' });
    expect(large.body.reason).toMatch(/more than 5 words/);
    expect(asked).toEqual([]);
    const off = await call(appWith(true, false), '/v1/fix', { item: recording, segment: paragraph, before: 'א פאראגראף לדגומה', after: 'א פאראגראף לדוגמה' });
    expect(off.body).toMatchObject({ live: false, reason: 'fixes are reviewed first for now' });
    expect(await words()).toMatchObject({ text: [{ text: 'מלים לדגומה כאן' }] });
  });

  it('answers 409 when the words changed since they were opened, and 401 when signed out', async () => {
    const app = appWith(true);
    expect((await call(app, '/v1/fix', { item: unit, segment: 'p1', before: 'משהו אחר', after: 'מלים לדוגמה כאן' })).status).toBe(409);
    expect((await call(app, '/v1/fix', { item: recording, segment: paragraph, before: 'משהו אחר', after: 'א פאראגראף לדוגמה' })).status).toBe(409);
    const response = await app.request('/v1/fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: unit, segment: 'p1', before: 'a', after: 'b' }) });
    expect(response.status).toBe(401);
  });
});

describe('the AI check on Workers AI', () => {
  it('sends only the words before and after, and reads yes, no, or nothing', async () => {
    const sent: any[] = [];
    const reply = (response: string, ok = true) => (async (_url: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), new Response(JSON.stringify({ success: ok, result: { response } }), { status: ok ? 200 : 500 }))) as unknown as typeof fetch;
    expect(await workersAiFixJudge({ accountId: 'a', token: 't', fetch: reply('Yes.') })({ before: 'ב', after: 'א' })).toBe(true);
    expect(await workersAiFixJudge({ accountId: 'a', token: 't', fetch: reply('no') })({ before: 'ב', after: 'א' })).toBe(false);
    expect(await workersAiFixJudge({ accountId: 'a', token: 't', fetch: reply('maybe') })({ before: 'ב', after: 'א' })).toBe(null);
    expect(await workersAiFixJudge({ accountId: 'a', token: 't', fetch: reply('', false) })({ before: 'ב', after: 'א' })).toBe(null);
    expect(sent[0].messages[1].content).toBe('Before: ב\nAfter: א');
  });
});
