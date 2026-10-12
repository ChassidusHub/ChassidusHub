import { beforeEach, describe, expect, it } from 'vitest';
import type { Catalog, SnapshotManifest, SnapshotTree, SnapshotWorkFile, SnapshotYearFile } from '@chassidushub/core';
import { SNAPSHOT_FILE_NAME, SNAPSHOT_MANIFEST_KEY, memorySnapshotStore, readSnapshot, refreshSnapshot, snapshotFileKey, snapshotSeq, writeSnapshot } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog, yudShvat } from './helpers.js';

/**
 * The catalog snapshot (docs/catalog-snapshot.md): the shelves, sefarim,
 * units and events as files a page draws from memory. It follows main, keeps
 * each list in the catalog's order, and a file that did not change keeps its
 * name, so its address stays cached.
 */

let catalog: Catalog;
let set: EntityId;
let rebbe: EntityId;
let shelf: EntityId;
let ls: EntityId;

const unit = (work: EntityId, volume: number, n: number) => ({
  work,
  position: [
    { level: 'volume', value: String(volume), label: { he: `חלק ${volume}` } },
    { level: 'parsha', value: 'bereishis', label: { he: 'בראשית' } },
    { level: 'sicha', value: String(n), label: { he: `עמ' ${n}` } },
  ],
  order: `v${volume}s${n}`,
  label: { he: `שיחה ${n}`, en: `Sicha ${n}` },
  // Only the fields shown are read into the snapshot.
  note: 'מילים',
});

beforeEach(async () => {
  const fresh = await freshCatalog();
  catalog = fresh.catalog;
  set = fresh.set;
  rebbe = await add(catalog, 'steward', 'steward', 'set', { name: { he: 'הרבי', en: 'The Rebbe' }, slug: 'the-rebbe', policy: 'moderated', keepers: ['keeper'] }, '/sets/the-rebbe');
  shelf = await add(catalog, 'steward', 'steward', 'set', { name: { he: 'שיחות' }, slug: 'sichos', policy: 'moderated', keepers: ['keeper'], parent: rebbe }, '/sets/sichos');
  ls = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ליקוטי שיחות' }, slug: 'ls', authors: [], genre: 'sichos', levels: ['volume', 'parsha', 'sicha'], sets: [shelf], order: 'b' }, '/likkutei-sichos');
});

const files = async (store: ReturnType<typeof memorySnapshotStore>) => {
  const manifest = JSON.parse((await store.get(SNAPSHOT_MANIFEST_KEY))!) as SnapshotManifest;
  const read = async <T>(file: string) => JSON.parse((await store.get(snapshotFileKey(file)))!) as T;
  return { manifest, read };
};

describe('catalog snapshot', () => {
  it('holds the tree in order, each sefer by volume, each year of events', async () => {
    const igros = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'אגרות קודש' }, slug: 'igros', authors: [], genre: 'igros', levels: ['volume'], sets: [shelf], order: 'a' }, '/igros-kodesh');
    const index = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'מפתח' }, slug: 'ls-index', authors: [], genre: 'chassidus', levels: [], sets: [shelf], addition: { kind: 'index', to: ls } }, '/ls-index');
    const loose = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ליקוט' }, slug: 'loose', authors: [], genre: 'chassidus', levels: [], sets: [shelf], addition: { kind: 'collection' } }, '/loose');
    const u2 = await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 1, 2), '/likkutei-sichos/1/2');
    const u1 = await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 1, 1), '/likkutei-sichos/1/1');
    const u3 = await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 2, 3), '/likkutei-sichos/2/3');
    const event = await add(catalog, 'mendy', 'keeper', 'event', { ...yudShvat(set), links: [{ kind: 'mugah', label: { he: 'מוגה' }, url: 'https://example.org/a.pdf' }] }, '/events/5742-05-10');
    await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק א' }, url: 'https://example.org/a.mp3', sets: [set] });
    await add(catalog, 'mendy', 'keeper', 'event', { kind: 'letter', title: { he: 'מכתב' }, date: '5742-05-11', sets: [set] });

    const store = memorySnapshotStore();
    const { manifest: written } = await writeSnapshot(catalog.db, store, { base: 'https://api.example/v1/catalog/files/' });
    const { manifest, read } = await files(store);
    expect(manifest).toEqual(written);
    expect(manifest.seq).toBe((await snapshotSeq(catalog.db)).seq);
    expect(manifest.version).toBe(String(manifest.seq));
    expect(manifest.counts).toMatchObject({ units: 3, events: 1 });
    for (const f of [manifest.tree, ...Object.values(manifest.works), ...Object.values(manifest.years)]) expect(f.file).toMatch(SNAPSHOT_FILE_NAME);

    const tree = await read<SnapshotTree>(manifest.tree.file);
    expect(tree.top[0]).toBe(rebbe);
    expect(tree.sets[rebbe]).toMatchObject({ path: '/sets/the-rebbe', name: { he: 'הרבי', en: 'The Rebbe' }, rebbe: 9, sets: [shelf] });
    // Official sefarim by their order; the index sits on its sefer's page, the loose addition at the shelf's end.
    expect(tree.sets[shelf]).toMatchObject({ parent: rebbe, works: [igros, ls], additions: [loose] });
    expect(tree.works[ls]).toMatchObject({
      path: '/likkutei-sichos',
      units: 3,
      additions: [index],
      parts: [
        { value: '1', label: { he: 'חלק 1' }, units: 2 },
        { value: '2', label: { he: 'חלק 2' }, units: 1 },
      ],
    });
    expect(tree.works[index]!.addition).toEqual({ kind: 'index', to: ls });

    expect(Object.keys(manifest.works)).toEqual([ls]);
    const sefer = await read<SnapshotWorkFile>(manifest.works[ls]!.file);
    expect(sefer.parts[0]!.items).toEqual([
      { id: u1, path: '/likkutei-sichos/1/1', title: { he: 'שיחה 1', en: 'Sicha 1' }, place: 'עמ׳ 1', group: 'בראשית' },
      { id: u2, path: '/likkutei-sichos/1/2', title: { he: 'שיחה 2', en: 'Sicha 2' }, place: 'עמ׳ 2', group: 'בראשית' },
    ]);
    expect(sefer.parts[1]!.items.map((u) => u.id)).toEqual([u3]);
    expect(JSON.stringify(sefer)).not.toContain('מילים');

    // Letters are left to their sefer.
    expect(Object.keys(manifest.years)).toEqual(['5742']);
    const year = await read<SnapshotYearFile>(manifest.years['5742']!.file);
    expect(year.events).toEqual([{ id: event, path: '/events/5742-05-10', kind: 'farbrengen', date: '5742-05-10', title: { he: 'יו״ד שבט תשמ״ב', en: 'Yud Shvat 5742' }, recordings: 1, links: ['mugah'] }]);
  });

  it('is built again only when main changed, and keeps the names of files that did not', async () => {
    await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 1, 1), '/likkutei-sichos/1/1');
    const store = memorySnapshotStore();
    const first = await refreshSnapshot(catalog.db, store);
    expect(first.built).toBe(true);
    expect((await refreshSnapshot(catalog.db, store)).built).toBe(false);

    // A new event: the tree and the sefer keep their files; a new year file and a new manifest.
    await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set), '/events/5742-05-10');
    const before = store.keys();
    const second = await refreshSnapshot(catalog.db, store);
    expect(second.built).toBe(true);
    expect(second.manifest.seq).toBeGreaterThan(first.manifest.seq);
    expect(second.manifest.tree.file).toBe(first.manifest.tree.file);
    expect(second.manifest.works[ls]!.file).toBe(first.manifest.works[ls]!.file);
    expect(store.keys().filter((k) => !before.includes(k))).toEqual([snapshotFileKey(second.manifest.years['5742']!.file)]);

    // A sefer renamed: a new tree file; the old one stays for readers holding the old manifest.
    const cs = await catalog.createChangeset('mendy', { title: 'Rename' });
    await catalog.putRevision(cs.id, 'mendy', { id: ls, type: 'work', data: { title: { he: 'לקוטי שיחות' }, slug: 'ls', authors: [], genre: 'sichos', levels: ['volume'], sets: [shelf] }, path: '/likkutei-sichos' });
    await catalog.submit(cs.id, 'mendy');
    await catalog.merge(cs.id, 'keeper');
    const third = await refreshSnapshot(catalog.db, store);
    expect(third.manifest.tree.file).not.toBe(second.manifest.tree.file);
    expect(await store.get(snapshotFileKey(second.manifest.tree.file))).not.toBeNull();
  });

  it('leaves a deleted unit out, and never reads a manifest back older', async () => {
    const gone = await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 1, 1), '/likkutei-sichos/1/1');
    const cs = await catalog.createChangeset('mendy', { title: 'Delete' });
    await catalog.putRevision(cs.id, 'mendy', { id: gone, type: 'unit', data: null });
    await catalog.submit(cs.id, 'mendy');
    await catalog.merge(cs.id, 'keeper');
    const parts = await readSnapshot(catalog.db);
    expect(parts.works.size).toBe(0);
    expect(parts.tree.works[ls]!.units).toBe(0);

    const store = memorySnapshotStore();
    const newer = { ...(await writeSnapshot(catalog.db, store)).manifest, seq: 1e9 };
    await store.put(SNAPSHOT_MANIFEST_KEY, JSON.stringify(newer), 'manifest');
    expect((await writeSnapshot(catalog.db, store)).manifest.seq).toBe(1e9);
  });
});
