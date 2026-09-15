import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { getDownloadedBytes, listDownloadTargets, runDownload } from './downloadManager';
import type { DownloadContentTypes, DownloadTarget } from './downloadManager';
import { MEDIA_CACHE_NAME } from './cacheName';

/** Minimal fake of the Cache Storage API this test needs - just enough of `caches.open`/`Cache#keys`/`Cache#match` to exercise `getDownloadedBytes` without a real browser. */
function fakeCaches(entries: Record<string, Response>): typeof caches {
  const cache = {
    keys: async () => Object.keys(entries).map((url) => new Request(url)),
    match: async (request: RequestInfo) => entries[typeof request === 'string' ? request : request.url],
  };
  return { open: async () => cache } as unknown as typeof caches;
}

function makeEntry(overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'occasionId' | 'hebrewYear'>): CatalogEntry {
  return { hebrewDate: '5711-05-10', occasionLabel: 'test', audio: [], pdfs: [], ...overrides };
}

const NONE: DownloadContentTypes = { audio: false, hanachaEditions: [], mugah: false, maamorim: false, hagahos: false, hosofos: false };

describe('listDownloadTargets', () => {
  it('includes every audio chapter when audio is enabled, and none when disabled', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      audio: [
        { workerFilename: 'a.mp3', durationMs: 1000, chapterName: 'Sicha 1' },
        { workerFilename: 'b.mp3', durationMs: 1000, chapterName: 'Sicha 2' },
      ],
    });

    const withAudio = listDownloadTargets([entry], { ...NONE, audio: true });
    expect(withAudio.map((t) => t.kind)).toEqual(['audio', 'audio']);
    expect(withAudio.map((t) => t.url)).toEqual([expect.stringContaining('a.mp3'), expect.stringContaining('b.mp3')]);

    expect(listDownloadTargets([entry], { ...NONE, audio: false })).toEqual([]);
  });

  it('includes a highlighted biltiMugah pdf only when its edition is enabled', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      pdfs: [
        { section: 'biltiMugah', label: 'שיחו"ק', driveFileId: 'sk' },
        { section: 'biltiMugah', label: 'תו"מ התוועדויות', driveFileId: 'tm' },
      ],
    });

    const skOnly = listDownloadTargets([entry], { ...NONE, hanachaEditions: ['sichosKodesh'] });
    expect(skOnly.map((t) => t.label)).toEqual(['שיחו"ק']);

    const both = listDownloadTargets([entry], { ...NONE, hanachaEditions: ['sichosKodesh', 'torasMenachem'] });
    expect(both.map((t) => t.label).sort()).toEqual(['שיחו"ק', 'תו"מ התוועדויות'].sort());

    expect(listDownloadTargets([entry], NONE)).toEqual([]);
  });

  it('never includes a biltiMugah pdf citing neither highlighted edition, regardless of settings - no toggle covers it', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      pdfs: [{ section: 'biltiMugah', label: 'some other source', driveFileId: 'other' }],
    });

    const everything: DownloadContentTypes = { audio: true, hanachaEditions: ['sichosKodesh', 'torasMenachem'], mugah: true, maamorim: true, hagahos: true, hosofos: true };
    expect(listDownloadTargets([entry], everything)).toEqual([]);
  });

  it('includes mugah/maamorim/hagahos/hosofos pdfs independently, each gated by its own toggle', () => {
    const entry = makeEntry({
      occasionId: 1,
      hebrewYear: 5711,
      pdfs: [
        { section: 'mugah', label: 'mugah pdf', driveFileId: 'm' },
        { section: 'maamorim', label: 'maamar pdf', driveFileId: 'a' },
        { section: 'hagahos', label: 'hagahos pdf', driveFileId: 'g' },
        { section: 'hosofos', label: 'hosofos pdf', driveFileId: 'h' },
      ],
    });

    expect(listDownloadTargets([entry], { ...NONE, mugah: true }).map((t) => t.label)).toEqual(['mugah pdf']);
    expect(listDownloadTargets([entry], { ...NONE, maamorim: true }).map((t) => t.label)).toEqual(['maamar pdf']);
    expect(listDownloadTargets([entry], { ...NONE, hagahos: true }).map((t) => t.label)).toEqual(['hagahos pdf']);
    expect(listDownloadTargets([entry], { ...NONE, hosofos: true }).map((t) => t.label)).toEqual(['hosofos pdf']);
    expect(listDownloadTargets([entry], NONE)).toEqual([]);
  });

  it('tags every target with its occasion so callers can group results back by occasion', () => {
    const entry = makeEntry({
      occasionId: 42,
      hebrewYear: 5711,
      audio: [{ workerFilename: 'a.mp3', durationMs: 1000 }],
    });

    const [target] = listDownloadTargets([entry], { ...NONE, audio: true });
    expect(target).toMatchObject({ hebrewYear: 5711, occasionId: 42 });
  });
});

describe('getDownloadedBytes', () => {
  const originalCaches = globalThis.caches;
  afterEach(() => {
    globalThis.caches = originalCaches;
  });

  it('sums real cached response sizes, not navigator.storage.estimate() - see its own doc comment for why', async () => {
    globalThis.caches = fakeCaches({
      'https://example.com/a.pdf': new Response('', { headers: { 'content-length': '1000' } }),
      'https://example.com/b.mp3': new Response('', { headers: { 'content-length': '2500' } }),
    });
    expect(await getDownloadedBytes()).toBe(3500);
  });

  it('is 0 for an empty cache', async () => {
    globalThis.caches = fakeCaches({});
    expect(await getDownloadedBytes()).toBe(0);
  });

  it('opens the same shared cache name playback and downloads both use', async () => {
    let openedName: string | undefined;
    globalThis.caches = {
      open: async (name: string) => {
        openedName = name;
        return { keys: async () => [], match: async () => undefined };
      },
    } as unknown as typeof caches;
    await getDownloadedBytes();
    expect(openedName).toBe(MEDIA_CACHE_NAME);
  });
});

describe('runDownload', () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  });

  /** A writable fake cache (unlike `fakeCaches` above, which is read-only) - `runDownload` both checks and populates the cache. */
  function fakeWritableCache(): Map<string, Response> {
    const stored = new Map<string, Response>();
    const cache = {
      match: async (request: RequestInfo) => stored.get(typeof request === 'string' ? request : request.url),
      put: async (request: RequestInfo, response: Response) => {
        stored.set(typeof request === 'string' ? request : request.url, response);
      },
    };
    globalThis.caches = { open: async () => cache } as unknown as typeof caches;
    return stored;
  }

  function makeTarget(url: string): DownloadTarget {
    return { url, hebrewYear: 5711, occasionId: 1, label: 'test', kind: 'audio' };
  }

  it('reports increasing byte progress while streaming a response with a known Content-Length, then done', async () => {
    fakeWritableCache();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(body, { headers: { 'content-length': '10' } })) as unknown as typeof fetch;

    const events: Array<[string, number | undefined]> = [];
    await runDownload([makeTarget('https://example.com/a.mp3')], {
      onEach: (_target, event, progress) => events.push([event, progress]),
    });

    expect(events).toEqual([
      ['downloading', undefined],
      ['downloading', 0.4],
      ['downloading', 1],
      ['done', undefined],
    ]);
  });

  it('reports undefined progress (but still completes) when Content-Length is missing', async () => {
    fakeWritableCache();
    // A plain string/Blob body gets an automatic Content-Length from
    // undici's Response - a raw stream body (like a real chunked-transfer
    // response with no known length) is what actually exercises this path.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(body)) as unknown as typeof fetch;

    const events: Array<[string, number | undefined]> = [];
    await runDownload([makeTarget('https://example.com/b.mp3')], {
      onEach: (_target, event, progress) => events.push([event, progress]),
    });

    expect(events).toEqual([
      ['downloading', undefined],
      ['done', undefined],
    ]);
  });

  it('skips fetching (and reports done directly) for a target already in the cache', async () => {
    const stored = fakeWritableCache();
    stored.set('https://example.com/c.mp3', new Response(''));
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const events: string[] = [];
    await runDownload([makeTarget('https://example.com/c.mp3')], { onEach: (_target, event) => events.push(event) });

    expect(events).toEqual(['done']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports an error event (and never a done) when the fetch fails', async () => {
    fakeWritableCache();
    globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;

    const events: string[] = [];
    await runDownload([makeTarget('https://example.com/missing.mp3')], { onEach: (_target, event) => events.push(event) });

    expect(events).toEqual(['downloading', 'error']);
  });

  it('reports an error for every target (never a silent no-op) when wifiOnly skips a metered connection', async () => {
    fakeWritableCache();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const originalConnection = (navigator as { connection?: unknown }).connection;
    Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true });

    try {
      const events: string[] = [];
      await runDownload([makeTarget('https://example.com/a.mp3'), makeTarget('https://example.com/b.mp3')], {
        wifiOnly: true,
        onEach: (_target, event) => events.push(event),
      });

      // Both targets settle to 'error' - a caller that moved its state to
      // 'queued'/'downloading' before calling runDownload (see
      // DownloadProvider) needs *some* event to un-stick it, or the UI is
      // left showing a spinner that never resolves - a real reported
      // "download doesn't work" symptom.
      expect(events).toEqual(['error', 'error']);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'connection', { value: originalConnection, configurable: true });
    }
  });
});
