import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { extractAshreinuEventId, resolveJemAudio } from '../src/jemAudio.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ccdbEvent1 = readFileSync(path.join(fixturesDir, 'ccdb-event-1.json'), 'utf8');

describe('extractAshreinuEventId', () => {
  it('extracts the leaf event id from a real ashreinu.app player URL', () => {
    expect(extractAshreinuEventId('https://ashreinu.app/#/player/parentEvent~1_event~2')).toBe(2);
  });

  it('handles the /index.html# variant seen in some crawled links', () => {
    expect(extractAshreinuEventId('https://ashreinu.app/index.html#/player/parentEvent~11_event~12')).toBe(12);
  });

  it('returns null for a URL with no event fragment', () => {
    expect(extractAshreinuEventId('https://ashreinu.app/')).toBeNull();
  });
});

describe('resolveJemAudio', () => {
  it('collects every audio recording from a real event response, including nested sub-events', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(JSON.parse(ccdbEvent1)),
    });

    const recordings = await resolveJemAudio(1, fetchImpl as unknown as typeof fetch);

    // Real fixture: event 1 (the farbrengen) has 4 sub-events, each with its own audio recording.
    expect(recordings).toHaveLength(4);
    expect(recordings.map((r) => r.eventId)).toEqual([2, 3, 4, 5]);
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
});
