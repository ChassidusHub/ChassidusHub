import { describe, expect, it } from 'vitest';
import type { ResolvedJemAudio } from '../src/db.js';
import { extractAshreinuEventId, extractAshreinuParentEventId } from '../src/jemAudio.js';
import type { JemAudioRecording } from '../src/jemAudio.js';
import { resolveAudioLinks } from '../src/resolveAudioLinks.js';
import { pickMaamarPart } from '../src/sections/maamorim.js';

// A ccdb stand-in: event 10 is a farbrengen with three parts; event 11 (the
// maamar's old id) is gone; event 20 is a farbrengen with two maamar parts.
function event(id: number, subEvents: Array<{ id: number; name: string }>): unknown {
  return {
    data: {
      id,
      sub_events: subEvents.map((sub) => ({
        id: sub.id,
        audio_recordings: [{ id: sub.id * 100, name: sub.name, duration: 1000, assets: [{ id: 1, uri: `https://cdn/${sub.id}.mp3`, file_format: 'mp3' }] }],
      })),
    },
  };
}
const EVENTS: Record<number, unknown> = {
  10: event(10, [
    { id: 101, name: 'Sicha 1' },
    { id: 102, name: 'Ma’amar Nigun' },
    { id: 103, name: 'Ma’amar' },
  ]),
  20: event(20, [
    { id: 201, name: "Ma'amar 1" },
    { id: 202, name: "Ma'amar 2" },
  ]),
  30: event(30, [{ id: 301, name: 'Ma’amar' }]),
};
const fetchImpl = (async (url: string) => {
  const id = Number(url.split('/').pop());
  const body = EVENTS[id];
  return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404 };
}) as unknown as typeof fetch;

function recording(eventId: number, chapterName: string | null): JemAudioRecording {
  return { eventId, chapterName, durationMs: 1, assets: [] };
}

describe('pickMaamarPart', () => {
  it("takes the one part named as a maamar, not the maamar's nigun", () => {
    expect(pickMaamarPart([recording(1, 'Sicha 1'), recording(2, 'Ma’amar Nigun'), recording(3, 'Ma’amar')]).map((r) => r.eventId)).toEqual([3]);
    expect(pickMaamarPart([recording(4, "Ma'amar Basi Legani")]).map((r) => r.eventId)).toEqual([4]);
    expect(pickMaamarPart([recording(5, 'Maamar')]).map((r) => r.eventId)).toEqual([5]);
  });

  it('takes nothing when no part or several parts are maamorim', () => {
    expect(pickMaamarPart([recording(1, 'Sicha 1'), recording(2, null)])).toEqual([]);
    expect(pickMaamarPart([recording(1, "Ma'amar 1"), recording(2, "Ma'amar 2")])).toEqual([]);
  });
});

describe('resolveAudioLinks with a fallback', () => {
  it("resolves the link's own event, and on a 404 the farbrengen's single maamar part", async () => {
    const replaced = new Map<number, ResolvedJemAudio[]>();
    const logged: string[] = [];
    const result = await resolveAudioLinks({
      rows: [
        { key: 1, url: 'https://ashreinu.app/#/player/parentEvent~10_event~30' }, // own event exists
        { key: 2, url: 'https://ashreinu.app/#/player/parentEvent~10_event~11' }, // gone: farbrengen 10's maamar
        { key: 3, url: 'https://ashreinu.app/#/player/parentEvent~20_event~21' }, // gone, and 20 has two maamorim
        { key: 4, url: 'https://ashreinu.app/#/player/parentEvent~40_event~41' }, // gone, and so is 40
      ],
      eventIdOf: (url) => extractAshreinuEventId(url),
      fallback: { eventIdOf: extractAshreinuParentEventId, pick: pickMaamarPart },
      replace: (key, recordings) => replaced.set(key, recordings),
      delayMs: 0,
      fetchImpl,
      log: (line) => logged.push(line),
    });
    expect(result).toEqual({ resolved: 2, resolvedByFallback: 1, noEventId: 0, noRecordingsFound: 0, unmatched: 1, httpErrors: 1 });
    expect(replaced.get(1)?.map((r) => r.ccdbEventId)).toEqual([301]);
    expect(replaced.get(2)).toEqual([{ ccdbEventId: 103, chapterIndex: 0, chapterName: 'Ma’amar', durationMs: 1000, url: 'https://cdn/103.mp3', fileFormat: 'mp3' }]);
    expect(replaced.has(3)).toBe(false);
    expect(logged).toEqual([
      '  3 (event 21): gone from ccdb, and event 20 has no single part to take',
      '  4 (event 41): ccdb event/40 failed: HTTP 404',
    ]);
  });

  it('keeps a 404 an error when there is no fallback', async () => {
    const result = await resolveAudioLinks({
      rows: [{ key: 1, url: 'https://ashreinu.app/#/player/parentEvent~10_event~11' }],
      eventIdOf: (url) => extractAshreinuEventId(url),
      replace: () => undefined,
      delayMs: 0,
      fetchImpl,
    });
    expect(result).toMatchObject({ resolved: 0, httpErrors: 1 });
  });
});
