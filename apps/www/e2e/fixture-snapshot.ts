import { libraryAnswer } from './fixture-library';
import { listenAnswer, shelves } from './fixture-listen';
import { isRebbe } from '../app/lib/catalog';

/**
 * The catalog snapshot in the stand-in API (docs/catalog-snapshot.md), made
 * from the same sample catalog it answers reads with (fixture-library.ts,
 * fixture-listen.ts), so the library's and listening's pages are tested
 * drawn from the snapshot, on the server and in the browser, and must come
 * out as when they read the API. Served at /v1/catalog/manifest.json and
 * /v1/catalog/files/<file>, as the API serves it, and in its small cut too
 * (/v1/catalog/index.json, its top, shelf and years files), which the
 * browser reads.
 */

type Item = { id: string; path: string | null; data: Record<string, unknown>; rev?: number; recordings?: number };
type Answer = { items?: Item[]; parts?: Array<{ value: string; label: { he: string } | null; units: number }> };
const ask = (path: string): Answer => (libraryAnswer(new URL(path, 'http://local'), shelves) ?? listenAnswer(new URL(path, 'http://local')) ?? {}) as Answer;

const order = (item: Item) => String(item.data.order ?? '');
const inOrder = (a: Item, b: Item) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : (a.path ?? '') < (b.path ?? '') ? -1 : 1);
const label = (value: unknown) => (Array.isArray(value) ? value : []) as Array<{ label?: { he?: string }; value?: string }>;

function build() {
  const sets = (ask('/v1/entities?type=set').items ?? []).sort(inOrder);
  const works = new Map<string, Item>();
  for (const set of sets) for (const work of ask(`/v1/entities/${set.id}/linked?field=sets&limit=500`).items ?? []) works.set(work.id, work);
  const all = [...works.values()].sort(inOrder);
  const isAddition = (work: Item) => !!work.data.addition;
  const additionTo = (work: Item) => (work.data.addition as { to?: string } | undefined)?.to;
  const files: Record<string, unknown> = {};
  const workFiles: Record<string, { file: string }> = {};
  const tree = {
    format: 1,
    top: sets.filter((set) => !set.data.parent).map((set) => set.id),
    sets: Object.fromEntries(
      sets.map((set) => {
        const on = all.filter((work) => (work.data.sets as string[]).includes(set.id));
        const official = on.filter((work) => !isAddition(work));
        return [
          set.id,
          {
            id: set.id,
            path: set.path,
            rev: 1,
            name: set.data.name,
            slug: set.data.slug,
            ...(set.data.parent ? { parent: set.data.parent } : {}),
            sets: sets.filter((inside) => inside.data.parent === set.id).map((inside) => inside.id),
            works: official.map((work) => work.id),
            additions: on.filter((work) => isAddition(work) && !official.some((o) => o.id === additionTo(work))).map((work) => work.id),
          },
        ];
      }),
    ),
    works: Object.fromEntries(
      all.map((work) => {
        const parts = ask(`/v1/works/${work.id}/outline`).parts ?? [];
        const units = parts.map((part) => ({ part, items: ask(`/v1/works/${work.id}/parts/${part.value}`).items ?? [] }));
        const first = label(units[0]?.items[0]?.data.position);
        if (parts.length) {
          const file = `work-${work.id}.1.json`;
          workFiles[work.id] = { file };
          files[file] = {
            format: 1,
            work: work.id,
            parts: units.map(({ part, items }) => ({
              ...part,
              items: items.map((unit) => {
                const position = label(unit.data.position);
                return {
                  id: unit.id,
                  path: unit.path,
                  title: unit.data.label,
                  ...(position.length > 1 && position.at(-1)?.label?.he ? { place: position.at(-1)!.label!.he!.replace(/'/g, '׳') } : {}),
                  ...(position.length > 2 && position[1]?.label?.he ? { group: position[1].label.he } : {}),
                };
              }),
            })),
          };
        }
        return [
          work.id,
          {
            id: work.id,
            path: work.path,
            rev: work.rev ?? 1,
            title: work.data.title,
            sets: work.data.sets,
            ...(work.data.addition ? { addition: work.data.addition } : {}),
            additions: all.filter((other) => additionTo(other) === work.id).map((other) => other.id),
            parts,
            units: parts.reduce((sum, part) => sum + part.units, 0),
            ...(first[0] ? { level: (first[0] as { level?: string }).level, depth: first.length } : {}),
          },
        ];
      }),
    ),
  };
  files['tree.1.json'] = tree;
  const events = (ask('/v1/events').items ?? []).sort((a, b) => String(a.data.date).localeCompare(String(b.data.date)));
  const years: Record<string, { file: string }> = {};
  for (const event of events) {
    const year = String(event.data.date).slice(0, 4);
    const file = `year-${year}.1.json`;
    years[year] = { file };
    const kept = (files[file] ??= { format: 1, year: Number(year), events: [] }) as { events: unknown[] };
    kept.events.push({ id: event.id, path: event.path, kind: event.data.kind, date: event.data.date, title: event.data.title ?? null, recordings: event.recordings ?? 0 });
  }
  files['manifest.json'] = { format: 1, version: 'sample-1', seq: 1, base: '/v1/catalog/files/', tree: { file: 'tree.1.json' }, works: workFiles, years };
  smallCut(files, tree, workFiles, years);
  return files;
}

type TreeSet = { id: string; path: string | null; name: unknown; parent?: unknown; sets: string[]; works: string[]; additions: string[] };
type TreeWork = { id: string; path: string | null; title: unknown; sets: unknown; addition?: unknown };

/** The same snapshot cut small (docs/catalog-snapshot.md, "The small cut"): the index, the top file, a file per top shelf, the years file. */
function smallCut(files: Record<string, unknown>, tree: { top: string[]; sets: Record<string, TreeSet>; works: Record<string, TreeWork> }, workFiles: Record<string, { file: string }>, years: Record<string, { file: string }>) {
  const entry = (item: { id: string; path: string | null }, name: unknown) => ({ id: item.id, path: item.path, name });
  const set = (id: string) => tree.sets[id]!;
  const work = (id: string) => tree.works[id]!;
  const on = (w: TreeWork) => w.sets as string[];
  const to = (w: TreeWork) => (w.addition as { to?: string } | undefined)?.to;
  const top = tree.top.map((id) => {
    const shelf = set(id);
    if (!isRebbe(shelf.path)) return { ...entry(shelf, shelf.name), rev: 1 };
    return {
      ...entry(shelf, shelf.name),
      rev: 1,
      rebbe: tree.top.filter((at) => isRebbe(set(at).path)).indexOf(id) + 1,
      // Each of his shelves with its official sefarim, its first 3 shelves' names, and whether it has additions to none of them (#301).
      sets: shelf.sets.map((inner) => ({
        ...entry(set(inner), set(inner).name),
        works: set(inner).works.map((w) => entry(work(w), work(w).title)),
        inner: set(inner).sets.slice(0, 3).map((at) => set(at).name),
        ...(set(inner).additions.length ? { loose: true } : {}),
      })),
      works: shelf.works.map((w) => entry(work(w), work(w).title)),
      additions: shelf.additions.map((w) => entry(work(w), work(w).title)),
    };
  });
  files['top.1.json'] = { format: 2, top };
  const shelves: Record<string, string> = {};
  for (const id of tree.top) {
    const under: string[] = [];
    const walk = (at: string) => {
      under.push(at);
      set(at).sets.forEach(walk);
    };
    walk(id);
    const works = new Set<string>();
    for (const w of Object.values(tree.works)) if (on(w).some((s) => under.includes(s))) works.add(w.id);
    // An addition here to a sefer elsewhere brings that sefer, and a sefer here its additions.
    for (const w of [...works]) if (to(work(w)) && tree.works[to(work(w))!]) works.add(to(work(w))!);
    for (const w of Object.values(tree.works)) if (to(w) && works.has(to(w)!)) works.add(w.id);
    const file = `shelf-${id}.1.json`;
    shelves[id] = file;
    files[file] = {
      format: 2,
      shelf: id,
      sets: Object.fromEntries(under.map((at) => [at, set(at)])),
      works: Object.fromEntries([...works].map((w) => [w, { ...work(w), ...(workFiles[w] ? { file: workFiles[w]!.file } : {}) }])),
    };
  }
  const events = (name: string) => (files[name] as { events: unknown[] }).events.length;
  files['years.1.json'] = { format: 2, years: Object.fromEntries(Object.entries(years).map(([year, { file }]) => [year, { file, events: events(file) }])) };
  files['index.json'] = { format: 2, version: 'sample-1', top: 'top.1.json', shelves, years: 'years.1.json' };
}

let files: Record<string, unknown> | null = null;

/** A file of the sample snapshot, or undefined when the address is not one. */
export function snapshotAnswer(url: URL): unknown {
  files ??= build();
  if (url.pathname === '/v1/catalog/manifest.json') return files['manifest.json'];
  if (url.pathname === '/v1/catalog/index.json') return files['index.json'];
  const name = /^\/v1\/catalog\/files\/([\w.-]+\.json)$/.exec(url.pathname)?.[1];
  return name && name !== 'manifest.json' && name !== 'index.json' ? files[name] : undefined;
}
