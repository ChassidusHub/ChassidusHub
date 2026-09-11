import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { extractAshreinuEventId, extractAshreinuParentEventId, resolveJemAudio } from '../src/jemAudio.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ccdbEvent1 = readFileSync(path.join(fixturesDir, 'ccdb-event-1.json'), 'utf8');

describe('extractAshreinuEventId', () => {
  it('extracts the leaf event id from a real ashreinu.app player URL (~ shape)', () => {
    expect(extractAshreinuEventId('https://ashreinu.app/#/player/parentEvent~1_event~2')).toBe(2);
  });

  it('handles the /index.html# variant seen in some crawled links', () => {
    expect(extractAshreinuEventId('https://ashreinu.app/index.html#/player/parentEvent~11_event~12')).toBe(12);
  });

  it('extracts the leaf event id from the real query-param shape (= shape, 53 of 1,303 real audio links)', () => {
    expect(extractAshreinuEventId('https://ashreinu.app/player?parentEvent=75&event=76')).toBe(76);
  });

  it('handles event and parentEvent appearing in either order', () => {
    expect(extractAshreinuEventId('https://ashreinu.app/#/player/event~8386_parentEvent~8385')).toBe(8386);
  });

  it('returns null for a URL with no event fragment', () => {
    expect(extractAshreinuEventId('https://ashreinu.app/')).toBeNull();
  });
});

describe('extractAshreinuParentEventId', () => {
  it('extracts the parent (farbrengen-level) event id, distinct from the leaf (~ shape)', () => {
    expect(extractAshreinuParentEventId('https://ashreinu.app/#/player/parentEvent~1_event~2')).toBe(1);
  });

  it('extracts the parent event id from the real query-param shape', () => {
    expect(extractAshreinuParentEventId('https://ashreinu.app/player?parentEvent=75&event=76')).toBe(75);
  });

  it('equals the leaf id for a single-recording farbrengen (a real shape too: parentEvent=90&event=90)', () => {
    const url = 'https://ashreinu.app/player?parentEvent=90&event=90';
    expect(extractAshreinuParentEventId(url)).toBe(extractAshreinuEventId(url));
  });

  it('returns null for a URL with no parentEvent fragment', () => {
    expect(extractAshreinuParentEventId('https://ashreinu.app/')).toBeNull();
  });
});

describe('resolveJemAudio', () => {
  it('collects every audio recording from a real event response, including nested sub-events, with their real chapter names in order', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(JSON.parse(ccdbEvent1)),
    });

    const recordings = await resolveJemAudio(1, fetchImpl as unknown as typeof fetch);

    // Real fixture: event 1 (the farbrengen) has 4 sub-events, each with its own audio recording.
    expect(recordings).toHaveLength(4);
    expect(recordings.map((r) => r.eventId)).toEqual([2, 3, 4, 5]);
    expect(recordings.map((r) => r.chapterName)).toEqual(['Sicha 1', 'Sicha 2', 'Ma’amar', 'Sicha 3']);
    for (const recording of recordings) {
      expect(recording.durationMs).toBeGreaterThan(0);
      expect(recording.assets.length).toBeGreaterThan(0);
      for (const asset of recording.assets) {
        expect(asset.url).toMatch(/^https:\/\/dtgj2yu3gmlic\.cloudfront\.net\//);
      }
    }
  });

  it('calls the singular event/{id} endpoint, not the plural events/{id}', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { id: 2 } }) });
    await resolveJemAudio(2, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringMatching(/\/event\/2$/));
  });

  it('throws with the status code on a non-ok response rather than silently returning nothing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(resolveJemAudio(999, fetchImpl as unknown as typeof fetch)).rejects.toThrow('403');
  });

  it('returns an empty array (not an error) for an event with no audio_recordings anywhere in its tree', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { id: 42, sub_events: [{ id: 43 }] } }) });
    const recordings = await resolveJemAudio(42, fetchImpl as unknown as typeof fetch);
    expect(recordings).toEqual([]);
  });

  it('defaults chapterName to null when ccdb omits a name for a recording', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { id: 1, audio_recordings: [{ id: 100, duration: 1000, assets: [{ id: 100, uri: 'https://dtgj2yu3gmlic.cloudfront.net/x.mp3', file_format: 'mp3' }] }] },
        }),
    });
    const recordings = await resolveJemAudio(1, fetchImpl as unknown as typeof fetch);
    expect(recordings).toEqual([{ eventId: 1, chapterName: null, durationMs: 1000, assets: [{ url: 'https://dtgj2yu3gmlic.cloudfront.net/x.mp3', fileFormat: 'mp3' }] }]);
  });
});
