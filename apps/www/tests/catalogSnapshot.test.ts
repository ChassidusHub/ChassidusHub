import { ChassidusHub } from '@chassidushub/client';
import { describe, expect, it } from 'vitest';
import { localApi, rebbeOnTop } from '../app/catalog/localApi.js';
import { isNotLocal, snapshotFrom } from '../app/catalog/snapshot.js';
import { libraryPage } from '../app/library/page.js';
import { loadLibrary, loadOtherShelves } from '../app/library/load.js';
import { yearPage } from '../app/listen/events.js';
import { libraryAnswer } from '../e2e/fixture-library.js';
import { listenAnswer, shelves } from '../e2e/fixture-listen.js';
import { snapshotAnswer } from '../e2e/fixture-snapshot.js';

/**
 * The catalog pages drawn from the catalog snapshot (app/catalog/localApi.ts)
 * come out as when they are drawn from the API: both from the stand-in API's
 * sample catalog (e2e/fixture-*.ts), which answers the API's reads and serves
 * a snapshot of the same catalog.
 */

const json = (body: unknown) => new Response(body === undefined ? JSON.stringify({ error: 'not-found' }) : JSON.stringify(body), { status: body === undefined ? 404 : 200, headers: { 'Content-Type': 'application/json' } });
const answer = (url: URL) => libraryAnswer(url, shelves) ?? listenAnswer(url) ?? snapshotAnswer(url);

/** Every read the stand-in answers, counted; `small`, its snapshot read in the small cut (the index, the top, a shelf's file when asked). */
function standIn(small = false) {
  const asked: string[] = [];
  const api = new ChassidusHub({
    baseUrl: 'http://fixture',
    fetch: async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      asked.push(url.pathname);
      return json(answer(url));
    },
  });
  const read: string[] = [];
  const files = {
    manifest: async () => json(snapshotAnswer(new URL('http://fixture/v1/catalog/manifest.json'))),
    ...(small ? { index: async () => json(snapshotAnswer(new URL('http://fixture/v1/catalog/index.json'))) } : {}),
    file: async (name: string) => (read.push(name), json(snapshotAnswer(new URL(`http://fixture/v1/catalog/files/${name}`)))),
  };
  const snapshot = snapshotFrom(files);
  return { api, asked, read, snapshot, local: localApi(snapshot, api) };
}

const REBBE = 'rh-aaaaaas3';

/** A page with the fields only the API's items have (each read's own `order` keys) left out. */
const page = async (api: ChassidusHub, path: string) => JSON.parse(JSON.stringify(await libraryPage(api, new URL(path, 'http://site'))));

describe.each([
  ['the manifest', false],
  ['the small cut', true],
])('the catalog pages from the snapshot, read from %s', (_, small) => {
  it('draws a Rebbe, a sefer and a volume as the API does, with no API read', async () => {
    const { api, asked, local, snapshot } = standIn(small);
    await snapshot.shelf(REBBE);
    for (const path of ['/sets/the-rebbe', '/sample-sichos', '/sample-sichos/12', '/sample-sichos/13']) {
      const fromApi = await page(api, path);
      asked.length = 0;
      expect(await page(local, path), path).toEqual(fromApi);
      expect(asked, path).toEqual([]);
    }
  });

  it('sends a shelf of one sefer on to it, as the API does', async () => {
    const { local, snapshot } = standIn(small);
    await snapshot.shelf(REBBE);
    await expect(libraryPage(local, new URL('http://site/sets/the-rebbe-sample-sichos'))).rejects.toMatchObject({ status: 302, headers: expect.anything() });
  });

  it('draws the library and its other shelves as the API does', async () => {
    const { api, local } = standIn(small);
    expect(await loadLibrary(local)).toEqual(await loadLibrary(api));
    // The other shelves' page reads what is on each of them: in the small cut, that is in their files, so the server draws it.
    if (small) expect(isNotLocal(await loadOtherShelves(local).catch((error: unknown) => error))).toBe(true);
    else expect(await loadOtherShelves(local)).toEqual(await loadOtherShelves(api));
  });

  it('draws a year of listening as the API does, asking it only which events can be followed', async () => {
    const { api, asked, local } = standIn(small);
    for (const year of [5732, 5747, 5750]) {
      const fromApi = await yearPage(api, year);
      asked.length = 0;
      expect(await yearPage(local, year)).toEqual(fromApi);
      expect(asked.filter((path) => path !== '/v1/transcripts')).toEqual([]);
    }
  });

  it('leaves a sicha, an old path and another language to the API', async () => {
    const { local, snapshot } = standIn(small);
    await snapshot.shelf(REBBE);
    for (const path of ['/sample-sichos/12/2', '/some-old-path', '/sample-sichos?language=en']) {
      const failed = await libraryPage(local, new URL(path, 'http://site')).catch((error: unknown) => error);
      expect(isNotLocal(failed), path).toBe(true);
    }
  });

});

describe('the small cut', () => {
  it('draws the library from the index and the top file alone', async () => {
    const { api, local, read } = standIn(true);
    expect(await loadLibrary(local)).toEqual(await loadLibrary(api));
    expect(read).toEqual(['top.1.json']);
  });

  it('leaves a shelf to the API until its file is read, then draws it', async () => {
    const { local, read, snapshot } = standIn(true);
    for (const path of ['/sets/the-rebbe', '/sample-sichos']) {
      const failed = await libraryPage(local, new URL(path, 'http://site')).catch((error: unknown) => error);
      expect(isNotLocal(failed), path).toBe(true);
    }
    expect(await snapshot.shelf(REBBE)).toBe(true);
    expect(read).toContain('shelf-rh-aaaaaas3.1.json');
    await expect(libraryPage(local, new URL('http://site/sets/the-rebbe'))).resolves.toBeTruthy();
    // A shelf's file is read once.
    const before = read.length;
    await snapshot.shelf(REBBE);
    expect(read.length).toBe(before);
  });

  it('reads a sefer\'s units from the file its shelf names, and a year from the years file', async () => {
    const { local, read, snapshot } = standIn(true);
    await snapshot.shelf(REBBE);
    await libraryPage(local, new URL('http://site/sample-sichos/12'));
    expect(read.some((name) => name.startsWith('work-'))).toBe(true);
    expect(read).not.toContain('tree.1.json');
    expect(await snapshot.hasYear(5747)).toBe(true);
    expect(read).toContain('years.1.json');
  });

  it("draws a Rebbe's page from the top file alone as the API does (#301)", async () => {
    const { api, read, snapshot } = standIn(true);
    const core = (await snapshot.core())!;
    const fromApi = await page(api, '/sets/the-rebbe');
    expect(JSON.parse(JSON.stringify(rebbeOnTop(core, '/sets/the-rebbe')))).toEqual(fromApi);
    expect(read).toEqual(['top.1.json']);
    // Another Rebbe's shelf, or one that is no Rebbe's, waits for its file.
    expect(rebbeOnTop(core, '/sets/sample-more')).toBeNull();
  });

  it('reads the manifest when there is no index', async () => {
    const files = { manifest: async () => json(snapshotAnswer(new URL('http://fixture/v1/catalog/manifest.json'))), index: async () => json(undefined), file: async (name: string) => json(snapshotAnswer(new URL(`http://fixture/v1/catalog/files/${name}`))) };
    const core = await snapshotFrom(files).core();
    expect(core?.whole(REBBE)).toBe(true);
  });
});

describe('the snapshot', () => {
  it('reads nothing of a snapshot in a format it does not know', async () => {
    const files = { manifest: async () => json({ format: 2, version: 'x', tree: { file: 'tree.1.json' }, works: {}, years: {} }), file: async () => json(snapshotAnswer(new URL('http://fixture/v1/catalog/files/tree.1.json'))) };
    expect(await snapshotFrom(files).core()).toBeNull();
  });

  it('keeps the manifest it has while it asks for the next one', async () => {
    let now = 0;
    let version = 1;
    let asked = 0;
    const manifest = async () => {
      asked++;
      return json({ format: 1, version: String(version), tree: { file: `tree.${version}.json` }, works: {}, years: {} });
    };
    const file = async (name: string) => json({ ...(snapshotAnswer(new URL('http://fixture/v1/catalog/files/tree.1.json')) as object), name });
    const snapshot = snapshotFrom({ manifest, file, now: () => now });
    const first = await snapshot.core();
    now = 30_000;
    expect(await snapshot.core()).toBe(first);
    expect(asked).toBe(1);
    version = 2;
    now = 61_000;
    // The next one is asked for behind the page, which keeps the one it has.
    expect(await snapshot.core()).toBe(first);
    await new Promise((done) => setTimeout(done, 0));
    now = 62_000;
    const second = await snapshot.core();
    expect(second).not.toBe(first);
    expect((second!.tree as unknown as { name: string }).name).toBe('tree.2.json');
  });
});
