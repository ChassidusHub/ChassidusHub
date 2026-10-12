import { beforeEach, describe, expect, it } from 'vitest';
import type { Catalog, SnapshotIndex, SnapshotManifest, SnapshotNamesFile, SnapshotShelfFile, SnapshotTopFile, SnapshotTree, SnapshotWorkFile, SnapshotYearFile, SnapshotYearsFile } from '@chassidushub/core';
import { SNAPSHOT_CLAIM_MS, SNAPSHOT_FILE_NAME, SNAPSHOT_INDEX_KEY, SNAPSHOT_MANIFEST_KEY, memorySnapshotStore, readSnapshot, refreshSnapshot, snapshotFileKey, snapshotSeq, writeSnapshot } from '@chassidushub/core';
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
    for (const f of [manifest.tree, manifest.names, ...Object.values(manifest.works), ...Object.values(manifest.years)]) expect(f.file).toMatch(SNAPSHOT_FILE_NAME);

    const tree = await read<SnapshotTree>(manifest.tree.file);
    expect(tree.top[0]).toBe(rebbe);
    expect(tree.sets[rebbe]).toMatchObject({ path: '/sets/the-rebbe', name: { he: 'הרבי', en: 'The Rebbe' }, rebbe: 9, sets: [shelf] });
    // Official sefarim by their order; the index sits on its sefer's page, the loose addition at the shelf's end.
    expect(tree.sets[shelf]).toMatchObject({ parent: rebbe, works: [igros, ls], additions: [loose] });
    expect(tree.works[ls]).toMatchObject({
      path: '/likkutei-sichos',
      units: 3,
      level: 'volume',
      depth: 3,
      additions: [index],
      parts: [
        { value: '1', label: { he: 'חלק 1' }, units: 2 },
        { value: '2', label: { he: 'חלק 2' }, units: 1 },
      ],
    });
    expect(tree.works[index]!.addition).toEqual({ kind: 'index', to: ls });
    expect(tree.works[index]!.depth).toBeUndefined();
    expect(tree.works[ls]!.rev).toBeGreaterThan(0);

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
    // Every name, flat, for search as the person types.
    const names = (await read<SnapshotNamesFile>(manifest.names.file)).names;
    expect(manifest.names.rows).toBe(names.length);
    expect(names).toContainEqual(['shelf', 'שיחות', null, 'הרבי', '/sets/sichos']);
    expect(names).toContainEqual(['sefer', 'ליקוטי שיחות', null, 'שיחות', '/likkutei-sichos']);
    expect(names).toContainEqual(['volume', 'חלק 1', null, 'ליקוטי שיחות', '/likkutei-sichos/1']);
    expect(names).toContainEqual(['sicha', 'שיחה 2', 'Sicha 2', 'ליקוטי שיחות חלק 1', '/likkutei-sichos/1/2']);
    expect(names).toContainEqual(['farbrengen', 'יו״ד שבט תשמ״ב', 'Yud Shvat 5742', null, '/events/5742-05-10', 'י׳ שבט תשמ״ב']);

    expect(year.events).toEqual([{ id: event, path: '/events/5742-05-10', kind: 'farbrengen', date: '5742-05-10', title: { he: 'יו״ד שבט תשמ״ב', en: 'Yud Shvat 5742' }, recordings: 1, links: ['mugah'] }]);
  });

  it('is built again only when main changed, and keeps the names of files that did not', async () => {
    await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 1, 1), '/likkutei-sichos/1/1');
    const store = memorySnapshotStore();
    const first = await refreshSnapshot(catalog.db, store);
    expect(first.built).toBe(true);
    expect((await refreshSnapshot(catalog.db, store)).built).toBe(false);

    // A new event: the tree, the sefer, the top and the shelves keep their files; a new year file, new names and years, a new manifest and index.
    await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set), '/events/5742-05-10');
    const before = store.keys();
    const second = await refreshSnapshot(catalog.db, store);
    expect(second.built).toBe(true);
    expect(second.manifest.seq).toBeGreaterThan(first.manifest.seq);
    expect(second.manifest.tree.file).toBe(first.manifest.tree.file);
    expect(second.manifest.works[ls]!.file).toBe(first.manifest.works[ls]!.file);
    expect(store.keys().filter((k) => !before.includes(k))).toEqual([snapshotFileKey(second.manifest.names.file), snapshotFileKey(second.manifest.years['5742']!.file), snapshotFileKey((JSON.parse((await store.get(SNAPSHOT_INDEX_KEY))!) as SnapshotIndex).years)].sort());

    // A sefer renamed: a new tree file; the old one stays for readers holding the old manifest.
    const cs = await catalog.createChangeset('mendy', { title: 'Rename' });
    await catalog.putRevision(cs.id, 'mendy', { id: ls, type: 'work', data: { title: { he: 'לקוטי שיחות' }, slug: 'ls', authors: [], genre: 'sichos', levels: ['volume'], sets: [shelf] }, path: '/likkutei-sichos' });
    await catalog.submit(cs.id, 'mendy');
    await catalog.merge(cs.id, 'keeper');
    const third = await refreshSnapshot(catalog.db, store);
    expect(third.manifest.tree.file).not.toBe(second.manifest.tree.file);
    expect(await store.get(snapshotFileKey(second.manifest.tree.file))).not.toBeNull();
  });

  it('cuts the tree small for a slow first tap: an index of names, the top, one file per top shelf', async () => {
    const other = await add(catalog, 'steward', 'steward', 'set', { name: { he: 'עוד' }, slug: 'other', policy: 'moderated', keepers: ['keeper'] }, '/sets/other');
    const elsewhere = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'מפתח' }, slug: 'ls-index', authors: [], genre: 'chassidus', levels: [], sets: [other], addition: { kind: 'index', to: ls } }, '/ls-index');
    await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 1, 1), '/likkutei-sichos/1/1');
    await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set), '/events/5742-05-10');
    const store = memorySnapshotStore();
    const { manifest } = await writeSnapshot(catalog.db, store);
    const index = JSON.parse((await store.get(SNAPSHOT_INDEX_KEY))!) as SnapshotIndex;
    const read = async <T>(file: string) => JSON.parse((await store.get(snapshotFileKey(file)))!) as T;

    expect(index).toEqual({ format: 2, version: manifest.version, top: expect.stringMatching(SNAPSHOT_FILE_NAME), shelves: expect.any(Object), years: expect.stringMatching(SNAPSHOT_FILE_NAME), names: manifest.names.file });
    const tree = await read<SnapshotTree>(manifest.tree.file);
    expect(Object.keys(index.shelves)).toEqual(tree.top);

    // The Rebbe's page draws from the top file alone; another top shelf is its name and path.
    const top = await read<SnapshotTopFile>(index.top);
    expect(top.top.map((s) => s.id)).toEqual(tree.top);
    expect(top.top[0]).toEqual({
      id: rebbe,
      path: '/sets/the-rebbe',
      name: { he: 'הרבי', en: 'The Rebbe' },
      rev: tree.sets[rebbe]!.rev,
      rebbe: 9,
      // Each of his shelves with its sefarim, so his page draws them with no other file.
      sets: [{ id: shelf, path: '/sets/sichos', name: { he: 'שיחות' }, works: [{ id: ls, path: '/likkutei-sichos', name: { he: 'ליקוטי שיחות' } }], inner: [] }],
      works: [],
      additions: [],
    });
    expect(top.top.find((s) => s.id === other)).toEqual({ id: other, path: '/sets/other', name: { he: 'עוד' }, rev: tree.sets[other]!.rev });

    // A top shelf's file holds what is under it, as in the tree, and the work file of each sefer with units.
    const mine = await read<SnapshotShelfFile>(index.shelves[rebbe]!);
    expect(Object.keys(mine.sets).sort()).toEqual([rebbe, shelf].sort());
    expect(mine.sets[shelf]).toEqual(tree.sets[shelf]);
    expect(mine.works[ls]).toEqual({ ...tree.works[ls], file: manifest.works[ls]!.file });
    // An addition to it on another shelf comes along, so the sefer's page can list it.
    expect(mine.works[elsewhere]).toEqual(tree.works[elsewhere]);
    const theirs = await read<SnapshotShelfFile>(index.shelves[other]!);
    expect(Object.keys(theirs.works).sort()).toEqual([elsewhere, ls].sort());

    const years = await read<SnapshotYearsFile>(index.years);
    expect(years.years).toEqual({ '5742': { file: manifest.years['5742']!.file, events: 1 } });
    expect(new TextEncoder().encode(JSON.stringify(index)).byteLength).toBeLessThan(1000);
  });

  it('names a Rebbe’s shelf’s first shelves inside, and says when it has loose additions', async () => {
    const names = ['א', 'ב', 'ג', 'ד'];
    for (const [i, he] of names.entries()) await add(catalog, 'steward', 'steward', 'set', { name: { he }, slug: `inner-${i}`, policy: 'moderated', keepers: ['keeper'], parent: shelf, order: String(i) }, `/sets/inner-${i}`);
    await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ליקוט' }, slug: 'loose', authors: [], genre: 'chassidus', levels: [], sets: [shelf], addition: { kind: 'collection' } }, '/loose');
    const store = memorySnapshotStore();
    await writeSnapshot(catalog.db, store);
    const index = JSON.parse((await store.get(SNAPSHOT_INDEX_KEY))!) as SnapshotIndex;
    const top = JSON.parse((await store.get(snapshotFileKey(index.top)))!) as SnapshotTopFile;
    expect(top.top[0]!.sets![0]).toMatchObject({ id: shelf, inner: [{ he: 'א' }, { he: 'ב' }, { he: 'ג' }], loose: true });
  });

  it('builds the index for a manifest written before it existed', async () => {
    const store = memorySnapshotStore();
    await writeSnapshot(catalog.db, store);
    await store.put(SNAPSHOT_INDEX_KEY, '', 'manifest');
    expect((await refreshSnapshot(catalog.db, store)).built).toBe(true);
    expect(JSON.parse((await store.get(SNAPSHOT_INDEX_KEY))!).format).toBe(2);
    expect((await refreshSnapshot(catalog.db, store)).built).toBe(false);
  });

  it('builds one change once across isolates, and catches what merged while it built (#288)', async () => {
    const store = memorySnapshotStore({ shared: true });
    const first = await refreshSnapshot(catalog.db, store);
    expect(first.built).toBe(true);

    // Two isolates hear of one change together: the one holding the claim builds it, the other serves what there is.
    await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 1, 1), '/likkutei-sichos/1/1');
    const held = (await store.claim!(new Date(Date.now() + SNAPSHOT_CLAIM_MS)))!;
    expect(held).toBeTruthy();
    const refused = await refreshSnapshot(catalog.db, store);
    expect(refused).toEqual({ manifest: first.manifest, built: false });
    await store.release!(held);

    // Handed back, the next ask builds; a change merged during a build is built in the same refresh.
    let merged = false;
    const busy = {
      ...store,
      async put(key: string, text: string, kind: 'immutable' | 'manifest') {
        await store.put(key, text, kind);
        if (kind === 'manifest' && !merged) {
          merged = true;
          await add(catalog, 'mendy', 'keeper', 'unit', unit(ls, 1, 2), '/likkutei-sichos/1/2');
        }
      },
    };
    const caught = await refreshSnapshot(catalog.db, busy);
    expect(caught.built).toBe(true);
    expect(caught.manifest.seq).toBe((await snapshotSeq(catalog.db)).seq);
    expect(caught.manifest.counts.units).toBe(2);
    // And the claim is free again.
    const again = await store.claim!(new Date(Date.now() + SNAPSHOT_CLAIM_MS));
    expect(again).toBeTruthy();
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
