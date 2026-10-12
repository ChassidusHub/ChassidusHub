import { describe, expect, it } from 'vitest';
import { corePreload, isPage, withPreload, type SnapshotFiles } from '../server/catalog.js';

const manifest = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Snapshot files whose manifest answers `answer`, counting its reads. */
function files(answer: () => Promise<Response>) {
  const reads = { count: 0 };
  const value: SnapshotFiles = {
    manifest: () => {
      reads.count++;
      return answer();
    },
    file: () => Promise.resolve(new Response(null, { status: 404 })),
  };
  return { value, reads };
}

describe("the page's preload of the snapshot's core", () => {
  it('names the manifest only until the tree is known, then both', async () => {
    const { value } = files(() => Promise.resolve(manifest({ tree: { file: 'tree-abc.json' } })));
    const preload = corePreload(value);
    expect(preload.link()).toBe('</_/catalog/manifest.json>; rel=preload; as=fetch; crossorigin=anonymous');
    await preload.refresh();
    expect(preload.link()).toBe('</_/catalog/manifest.json>; rel=preload; as=fetch; crossorigin=anonymous, </_/catalog/tree-abc.json>; rel=preload; as=fetch; crossorigin=anonymous');
  });

  it('reads the manifest again only a minute on, and once at a time', async () => {
    let now = 0;
    const { value, reads } = files(() => Promise.resolve(manifest({ tree: { file: 'tree-abc.json' } })));
    const preload = corePreload(value, () => now);
    await Promise.all([preload.refresh(), preload.refresh()]);
    now = 30_000;
    await preload.refresh();
    expect(reads.count).toBe(1);
    now = 61_000;
    await preload.refresh();
    expect(reads.count).toBe(2);
  });

  it('keeps the tree it knows when the manifest cannot be read, and names nothing that climbs out of the folder', async () => {
    let answer = manifest({ tree: { file: 'tree-abc.json' } });
    let now = 0;
    const { value } = files(() => Promise.resolve(answer));
    const preload = corePreload(value, () => now);
    await preload.refresh();
    answer = manifest(null, 502);
    now = 61_000;
    await preload.refresh();
    expect(preload.link()).toContain('tree-abc.json');
    answer = manifest({ tree: { file: '../secret.json' } });
    now = 122_000;
    await preload.refresh();
    expect(preload.link()).not.toContain('secret');
  });

  it('names nothing when the site hands out no snapshot', async () => {
    const preload = corePreload(null);
    await preload.refresh();
    expect(preload.link()).toBeNull();
  });

  it('goes on pages only, and leaves their body as it was', async () => {
    const get = new Request('https://new.chassidushub.org/library');
    const page = new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    expect(isPage(get, page)).toBe(true);
    expect(isPage(get, new Response('{}', { headers: { 'Content-Type': 'application/json' } }))).toBe(false);
    expect(isPage(get, new Response('', { status: 404, headers: { 'Content-Type': 'text/html' } }))).toBe(false);
    const sent = withPreload(page, '</_/catalog/manifest.json>; rel=preload; as=fetch; crossorigin=anonymous');
    expect(sent.headers.get('Link')).toContain('manifest.json');
    expect(await sent.text()).toBe('<!doctype html>');
  });
});
