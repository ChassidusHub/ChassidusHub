import { beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '@chassidushub/core';
import { createApp } from '../src/app.js';
import { refreshCommunity, refreshMafteach, refreshToCheck, refreshTranscripts, SUMMARY_MAX_AGE_MS, type Kept, type SummaryStore, type TranscriptsSummary } from '../src/summaries.js';
import { add, freshCatalog, yudShvat } from '../../../packages/core/tests/helpers.js';

/**
 * GET /v1/transcripts from the list the scheduled run keeps (issue #87):
 * counting every transcript's paragraphs took tens of seconds on a cold
 * database, and the home page waited on it.
 */

let catalog: Catalog;
let kept: TranscriptsSummary | null;
const store: SummaryStore = { read: async () => kept, write: async (summary) => void (kept = summary) };

beforeEach(async () => {
  const fresh = await freshCatalog();
  catalog = fresh.catalog;
  kept = null;
  const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(fresh.set), '/events/5742-05-10');
  const recording = await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'שיחה א׳' }, url: 'https://example.test/a.mp3', sets: [fresh.set] });
  const text = await add(catalog, 'mendy', 'keeper', 'text', { kind: 'transcript', recording, language: 'yi' });
  for (const [i, content] of ['א', 'ב'].entries()) await add(catalog, 'mendy', 'keeper', 'segment', { text, order: `a${i}`, kind: 'paragraph', content, proofread: i });
});

const transcripts = async (app: ReturnType<typeof createApp>, query = '') => ((await (await app.request(`/v1/transcripts${query}`)).json()) as { recordings: Array<{ paragraphs: number; checked: number }> }).recordings;

describe('the transcripts summary', () => {
  it('is made when missing or old, and kept while fresh', async () => {
    const now = new Date('2026-10-10T22:00:00Z');
    expect(await refreshTranscripts(catalog, store, now)).toBe(true);
    expect(kept?.recordings).toMatchObject([{ paragraphs: 2, checked: 1 }]);
    expect(await refreshTranscripts(catalog, store, new Date(now.getTime() + SUMMARY_MAX_AGE_MS - 1))).toBe(false);
    expect(await refreshTranscripts(catalog, store, new Date(now.getTime() + SUMMARY_MAX_AGE_MS))).toBe(true);
  });

  it('answers GET /v1/transcripts from the kept list, cut to the limit, without counting again', async () => {
    kept = { at: new Date().toISOString(), recordings: [1, 2, 3].map((n) => ({ recording: `rh-kept${n}`, title: null, event: null, durationMs: null, paragraphs: n, checked: 0, timedWords: 0 })) as never };
    const app = createApp({ catalog, transcripts: store });
    expect((await transcripts(app, '?limit=2')).map((r) => r.paragraphs)).toEqual([1, 2]);
  });

  it('counts on the request when nothing is kept (local work)', async () => {
    expect(await transcripts(createApp({ catalog, transcripts: store }))).toMatchObject([{ paragraphs: 2 }]);
    expect(await transcripts(createApp({ catalog }))).toMatchObject([{ paragraphs: 2 }]);
  });
});

describe('the other kept answers (#104)', () => {
  const stored = new Map<string, unknown>();
  const kept: Kept = { get: async <T>(name: string) => (stored.get(name) as T) ?? null, put: async (name, value) => void stored.set(name, JSON.parse(JSON.stringify(value))) };
  beforeEach(() => stored.clear());
  const toCheck = async (app: ReturnType<typeof createApp>, query = '') => (await (await app.request(`/v1/machine/to-check${query}`)).json()) as { transcripts: unknown[]; totals: { transcripts: number } };

  it('keeps what to check, made when missing or old', async () => {
    const now = new Date('2026-10-11T14:00:00Z');
    expect(await refreshToCheck(catalog, kept, now)).toBe(true);
    expect(stored.get('to-check')).toMatchObject({ at: now.toISOString(), lists: { totals: { transcripts: 1 } } });
    expect(await refreshToCheck(catalog, kept, new Date(now.getTime() + SUMMARY_MAX_AGE_MS - 1))).toBe(false);
    expect(await refreshToCheck(catalog, kept, new Date(now.getTime() + SUMMARY_MAX_AGE_MS))).toBe(true);
  });

  it('answers GET /v1/machine/to-check from the kept lists, cut to the limit, without counting again', async () => {
    const rows = [1, 2, 3].map((n) => ({ event: `rh-kept${n}`, path: null, title: null, date: null, paragraphs: n, checked: 0, made: '2026-10-11T00:00:00.000Z' }));
    stored.set('to-check', { at: new Date().toISOString(), lists: { transcripts: rows, scans: [], texts: [], totals: { transcripts: 3, paragraphs: 6, scans: 0, pages: 0, texts: 0, entries: 0 } } });
    const answer = await toCheck(createApp({ catalog, kept }), '?limit=2');
    expect(answer.transcripts).toHaveLength(2);
    expect(answer.totals.transcripts).toBe(3);
    // Nothing kept (local work): counted on the request.
    expect((await toCheck(createApp({ catalog }))).totals.transcripts).toBe(1);
  });

  it("keeps the community page's sums; the latest merges and what waits are read on the request (#171)", async () => {
    const now = new Date('2026-10-11T16:00:00Z');
    expect(await refreshCommunity(catalog, kept, now)).toBe(true);
    expect(stored.get('community')).toMatchObject({ at: now.toISOString(), totals: { gaps: { events: 1, eventsWithoutRecordings: 0 } } });
    expect(await refreshCommunity(catalog, kept, new Date(now.getTime() + SUMMARY_MAX_AGE_MS - 1))).toBe(false);

    // Kept sums are answered as kept, without summing again; the rest is now.
    stored.set('community', { at: now.toISOString(), totals: { people: 7, gaps: { events: 99, eventsWithoutRecordings: 98, eventsWithoutTexts: 97 } } });
    const community = async (app: ReturnType<typeof createApp>) => (await (await app.request('/v1/community?limit=1')).json()) as { people: number; gaps: { events: number }; recent: unknown[] };
    const answer = await community(createApp({ catalog, kept }));
    expect(answer).toMatchObject({ people: 7, gaps: { events: 99 } });
    expect(answer.recent).toHaveLength(1);
    // Nothing kept (local work): summed on the request.
    expect((await community(createApp({ catalog }))).gaps.events).toBe(1);
  });

  it('builds no subject index the catalog does not have', async () => {
    expect(await refreshMafteach(catalog, kept)).toBe(0);
    expect(stored.size).toBe(0);
  });
});
