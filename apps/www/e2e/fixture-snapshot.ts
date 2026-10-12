import { libraryAnswer } from './fixture-library';
import { listenAnswer, shelves } from './fixture-listen';

/**
 * The catalog snapshot in the stand-in API (docs/catalog-snapshot.md), made
 * from the same sample catalog it answers reads with (fixture-library.ts,
 * fixture-listen.ts), so the library's and listening's pages are tested
 * drawn from the snapshot, on the server and in the browser, and must come
 * out as when they read the API. Served at /v1/catalog/manifest.json and
 * /v1/catalog/files/<file>, as the API serves it.
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
  return files;
}

let files: Record<string, unknown> | null = null;

/** A file of the sample snapshot, or undefined when the address is not one. */
export function snapshotAnswer(url: URL): unknown {
  files ??= build();
  if (url.pathname === '/v1/catalog/manifest.json') return files['manifest.json'];
  const name = /^\/v1\/catalog\/files\/([\w.-]+\.json)$/.exec(url.pathname)?.[1];
  return name && name !== 'manifest.json' ? files[name] : undefined;
}
