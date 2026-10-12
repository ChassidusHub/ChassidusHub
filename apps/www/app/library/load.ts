import type { ChassidusHub, Item, ItemView, PathLevel as ApiLevel } from '@chassidushub/client';
import { redirect } from 'react-router';
import { namesOf } from '../edit/names';
import type { printingsFrom } from './printings';
import { isRebbe, nameOf, partLabel, rebbeimFirst } from '../lib/catalog';

/**
 * What the library's pages read from the API, cut down on the server to what
 * they draw, so a page carries no more than it shows. Each page reads in two
 * rounds: the page's item and its path bar (GET /v1/view), then everything
 * else about it at once. Shelves come from one list of every shelf (a few
 * statements) rather than the catalog tree, which costs the database dozens
 * of statements a level; the tree is not read.
 */

/** One line of a list: a name, a quiet line under it, where it goes. */
export interface Line {
  key: string;
  title: string;
  sub?: string;
  end?: string;
  to?: string;
}

/**
 * For Edit: the revision shown, the page's own names, and the shelf it is on
 * (the level above it in its path bar), which is edited on its own page.
 */
function ownFields(item: Item, levels: ApiLevel[]) {
  const above = levels.filter((level) => level.chosen.path && level.chosen.path !== item.path).at(-1);
  return {
    rev: (item as { rev?: number }).rev ?? 0,
    names: namesOf(item.data),
    inside: above ? { path: above.chosen.path!, label: nameOf(above.chosen.name) } : null,
  };
}

/** Every shelf in the catalog, in one cheap read (a few statements, where the tree costs dozens a level). */
async function allShelves(api: ChassidusHub): Promise<Item[]> {
  const { items } = await api.listItems({ type: 'set', limit: 500 });
  return items;
}

const parentOf = (set: Item) => (set.data as { parent?: string }).parent ?? null;
const orderOf = (item: Item) => String((item.data as { order?: unknown }).order ?? '');
/** The catalog's order: by `order`, then by path. */
const inOrder = (a: Item, b: Item) => (orderOf(a) < orderOf(b) ? -1 : orderOf(a) > orderOf(b) ? 1 : (a.path ?? '').localeCompare(b.path ?? ''));
const shelfName = (set: Item) => nameOf((set.data as { name?: unknown }).name, set.id);
const seferName = (work: Item) => nameOf((work.data as { title?: unknown }).title, work.id);
const isAdditionItem = (work: Item) => !!(work.data as { addition?: unknown }).addition;

/** The shelves inside a shelf, in order. */
const shelvesIn = (sets: Item[], id: string) => sets.filter((set) => parentOf(set) === id).sort(inOrder);

/** A shelf's row: its name, and the shelves inside it as the quiet line under it. */
function shelfLine(sets: Item[], set: Item): Line {
  const inside = shelvesIn(sets, set.id).slice(0, 3).map(shelfName).join(' · ');
  return { key: set.id, title: shelfName(set), sub: inside || undefined, to: set.path ?? undefined };
}

/** The library: the Rebbeim, each with the first shelves of his sefarim. */
export async function loadLibrary(api: ChassidusHub) {
  const sets = await allShelves(api);
  const rebbeim = sets.filter((set) => !parentOf(set) && isRebbe(set.path));
  return { rebbeim: rebbeimFirst(rebbeim).map((set) => shelfLine(sets, set)) };
}

/**
 * The other top shelves (`/library?more`). A shelf with no shelves in it is
 * asked for the first two things on it, a few shelves at a time so the database is
 * not asked for them all at once: one with none is left out (old shelves the
 * catalog has emptied), one with a single sefer goes straight to it. It takes
 * a round of reads more than any other page, so the page streams it in.
 */
export async function loadOtherShelves(api: ChassidusHub): Promise<Line[]> {
  const sets = await allShelves(api);
  const others = sets.filter((set) => !parentOf(set) && !isRebbe(set.path)).sort(inOrder);
  const lineOf = async (set: Item): Promise<Line | null> => {
    if (shelvesIn(sets, set.id).length) return shelfLine(sets, set);
    const { items } = await api.listLinked({ id: set.id, field: 'sets', limit: 2 });
    if (!items.length) return null;
    const only = items.length === 1 && items[0]!.type === 'work' && !isAdditionItem(items[0]!) ? items[0]! : null;
    return only?.path ? { key: set.id, title: seferName(only), to: only.path } : shelfLine(sets, set);
  };
  const lines: Array<Line | null> = [];
  for (let at = 0; at < others.length; at += 6) lines.push(...(await Promise.all(others.slice(at, at + 6).map(lineOf))));
  return lines.filter((line): line is Line => !!line);
}

/**
 * A Rebbe's or a shelf's page: its shelves and official sefarim, then the
 * books on it that are additions (those to a sefer here are on that sefer's
 * page). A shelf with one official sefer and no shelves, other than a
 * Rebbe's, sends its page on to that sefer.
 */
export async function loadSet(api: ChassidusHub, root: Item, levels: ApiLevel[]) {
  const id = root.id;
  const [sets, works] = await Promise.all([allShelves(api), api.listLinked({ id, field: 'sets', type: 'work', limit: 500 })]);
  const shelves = shelvesIn(sets, id);
  const official = works.items.filter((work) => !isAdditionItem(work)).sort(inOrder);
  if (!shelves.length && official.length === 1 && !isRebbe(root.path) && official[0]!.path) throw redirect(official[0]!.path);
  const here = new Set(official.map((work) => work.id));
  const workLine = (work: Item): Line => ({ key: work.id, title: seferName(work), to: work.path ?? undefined });
  return {
    screen: 'set' as const,
    id,
    path: root.path,
    title: shelfName(root),
    rebbe: isRebbe(root.path),
    levels,
    ...ownFields(root, levels),
    lines: [...shelves.map((set) => shelfLine(sets, set)), ...official.map(workLine)],
    additions: works.items
      .filter((work) => {
        const to = (work.data as { addition?: { to?: string } }).addition?.to;
        return isAdditionItem(work) && !(to && here.has(to));
      })
      .sort(inOrder)
      .map(workLine),
  };
}

/** What an addition is to its sefer, as its row's quiet line says it. */
const additionKinds: Record<string, string> = { commentary: 'ביאור', index: 'מפתח', about: 'על הספר', collection: 'ליקוט', other: '' };

/**
 * Whether a sefer's volumes read as a grid of numbers: they are numbered, and
 * (nearly) all called "חלק" or "כרך" and a number. Volumes with names of their
 * own (Toras Menachem's years) are a list instead.
 */
function asGrid(parts: Array<{ value?: string; label?: unknown }>): boolean {
  if (parts.length < 2 || !parts.every((part) => /^\d+$/.test(part.value ?? ''))) return false;
  const plain = parts.filter((part) => !nameOf(part.label) || /^(חלק|כרך)\s+\S+$/.test(nameOf(part.label))).length;
  return plain >= parts.length * 0.8;
}

/** Nothing, where the API answers that a read does not apply (an outline of something that is not a sefer). */
const orNothing = <T>(read: Promise<T>): Promise<T | null> => read.catch((error) => ((error as { status?: number }).status && (error as { status: number }).status < 500 ? null : Promise.reject(error)));

/**
 * What a library page is drawn with: the API's address (the browser reads a
 * sefer's printings from it), and for a page asked to show a scan (`?scan=`),
 * the server's `printingsFrom` (app/library/printings.ts), passed in so that
 * the browser's clicks (app/catalog/clicks.ts) need not load it.
 */
export interface LoadOptions {
  apiBase: string;
  scan?: typeof printingsFrom;
}

/** The printings of a sefer, read on the server only for a page asked to show a scan (`?scan=`). */
const printingsFor = (api: ChassidusHub, work: string, scan: unknown) => (scan ? api.listLinked({ id: work, field: 'work', type: 'publication', limit: 500 }).then((page) => page.items) : Promise.resolve(null));

/**
 * A sefer's volumes and additions as its view brought them (GET /v1/view),
 * read here only where the view did not: from the catalog snapshot
 * (app/catalog/localApi.ts), whose reads cost nothing, or from an older API.
 */
async function outlineOf(api: ChassidusHub, view: ItemView) {
  if (view.outline) return view.outline;
  const outline = await orNothing(api.workOutline({ id: view.item.id }));
  return outline?.parts.map((part) => ({ value: part.value ?? '', label: (part.label ?? null) as Record<string, unknown> | null, units: part.units ?? 0 })) ?? null;
}

async function additionsOf(api: ChassidusHub, view: ItemView): Promise<NonNullable<ItemView['additions']>> {
  if (view.additions) return view.additions;
  const page = await orNothing(api.listLinked({ id: view.item.id, field: 'addition.to', type: 'work', limit: 100 }));
  return (page?.items ?? []).map((a) => {
    const data = a.data as { title?: Record<string, unknown>; addition?: { kind?: string } };
    return { id: a.id, path: a.path, name: data.title ?? null, kind: data.addition?.kind ?? null };
  });
}

/**
 * A sefer's page, from its view: its volumes and its additions (which the
 * view brings), and its printings (read by the browser unless a scan was
 * asked for). Null when the item is not a sefer.
 */
export async function loadWork(api: ChassidusHub, view: ItemView, options: LoadOptions) {
  const item = view.item;
  const levels = view.pathBar;
  if (item.type !== 'work') return null;
  const id = item.id;
  const [outline, additions, publications] = await Promise.all([outlineOf(api, view), additionsOf(api, view), printingsFor(api, id, options.scan)]);
  if (!outline) return null;
  const data = item.data as { title?: unknown };
  const author = levels.find((level) => level.kind === 'set' && isRebbe(level.chosen.path));
  const parts = outline.map((part) => ({ value: part.value, label: partLabel(part.label, part.value), units: part.units }));
  return {
    screen: 'work' as const,
    id,
    path: item.path,
    api: options.apiBase,
    title: nameOf(data.title, id),
    author: author ? nameOf(author.chosen.name) : undefined,
    levels,
    ...ownFields(item, levels),
    grid: asGrid(outline),
    parts,
    printings: publications && options.scan ? options.scan(publications) : null,
    additions: additions.map((addition): Line => ({ key: addition.id, title: nameOf(addition.name, addition.id), sub: additionKinds[addition.kind ?? ''] || undefined, to: addition.path ?? undefined })),
  };
}

/** A unit's place in its volume ("עמ׳ 49"), from the last of its position's labels. */
function placeOf(position: unknown): string | undefined {
  const levels = Array.isArray(position) ? (position as Array<{ label?: unknown }>) : [];
  const last = levels.length > 1 ? nameOf(levels[levels.length - 1]?.label) : '';
  return last ? last.replace(/'/g, '׳') : undefined;
}

/** Headings inside a volume (a reshimah's parts), from a unit's position between the volume and the unit. */
function groupOf(position: unknown): string | undefined {
  const levels = Array.isArray(position) ? (position as Array<{ label?: unknown }>) : [];
  return levels.length > 2 ? nameOf(levels[1]?.label) || undefined : undefined;
}

/**
 * A volume of a sefer, which is no item of its own: its path is the sefer's
 * path and its place (/likkutei-sichos/12). From the sefer's view, which
 * brings the volume's units when it was read at the volume's path: its
 * units, its path bar (the sefer's, and the volume with the other volumes),
 * and its printings.
 */
export async function loadVolume(api: ChassidusHub, view: ItemView, value: string, options: LoadOptions) {
  const work = view.item;
  if (work.type !== 'work') return null;
  const workId = work.id;
  const [outline, units, publications] = await Promise.all([
    outlineOf(api, view),
    view.volume?.value === value ? view.volume.units : orNothing(api.workPart({ id: workId, part: value, limit: 1000 })).then((part) => part?.items ?? null),
    printingsFor(api, workId, options.scan),
  ]);
  const here = outline?.find((p) => p.value === value);
  if (!here || !units) return null;
  const label = partLabel(here.label, value);
  const title = nameOf((work.data as { title?: unknown }).title, work.id);
  const level: ApiLevel = {
    kind: 'part',
    level: (units[0]?.data.position as Array<{ level?: string }> | undefined)?.[0]?.level,
    chosen: { path: `${work.path}/${value}`, name: { he: label }, value },
    choices: outline!.map((p) => ({ path: `${work.path}/${p.value}`, name: { he: partLabel(p.label, p.value) }, value: p.value, units: p.units })),
  };
  return {
    screen: 'volume' as const,
    id: work.id,
    path: `${work.path}/${value}`,
    // A volume is no item of its own: its name is the sefer's, edited on the sefer's page.
    workPath: work.path,
    api: options.apiBase,
    title,
    value,
    label,
    levels: [...view.pathBar, level],
    units: units.map((unit) => ({
      key: unit.id,
      title: nameOf(unit.data.label, unit.path ?? unit.id),
      sub: placeOf(unit.data.position),
      group: groupOf(unit.data.position),
      to: unit.path ?? `/${unit.id}`,
    })),
    printings: publications && options.scan ? options.scan(publications, { value, label }) : null,
  };
}

type Loaded<T extends (...args: never[]) => Promise<unknown>> = NonNullable<Awaited<ReturnType<T>>>;
export type SetData = Loaded<typeof loadSet>;
export type WorkData = Loaded<typeof loadWork>;
export type VolumeData = Loaded<typeof loadVolume>;
