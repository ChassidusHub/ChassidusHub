import { beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '@chassidushub/core';
import { createApp } from '../src/app.js';
import { refreshTranscripts, SUMMARY_MAX_AGE_MS, type SummaryStore, type TranscriptsSummary } from '../src/summaries.js';
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
