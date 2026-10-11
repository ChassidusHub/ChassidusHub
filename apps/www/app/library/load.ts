import type { ChassidusHub, Item, PathLevel as ApiLevel, TreeNode } from '@chassidushub/client';
import { redirect } from 'react-router';
import { printingsFrom } from './printings';
import { isEmpty, isRebbe, nameOf, officialChildren, onlySefer, partLabel, rebbeimFirst } from '../lib/catalog';

/**
 * What the library's pages read from the API, cut down on the server to what
 * they draw, so a page carries no more than it shows. Each page reads in two
 * rounds: where its path is, then everything about it at once. The tree is
 * read one level deep only: each level further costs the database hundreds of
 * statements (GET /v1/tree reads child by child), so a shelf's row has no line
 * of its sefarim under it until the API gives a shelf's page in one read.
 */

/** One line of a list: a name, a quiet line under it, where it goes. */
export interface Line {
  key: string;
  title: string;
  sub?: string;
  end?: string;
  to?: string;
}

/** The quiet line under a shelf: its first few sefarim. */
const subOf = (node: TreeNode) =>
  officialChildren(node)
    .slice(0, 3)
    .map((child) => nameOf(child.name))
    .join(' · ') || undefined;

/** A shelf's or sefer's row: a shelf with one sefer goes straight to the sefer. */
function lineOf(node: TreeNode): Line {
  const sefer = isRebbe(node.path) ? null : onlySefer(node);
  if (sefer) return { key: node.id, title: nameOf(sefer.name), to: sefer.path ?? undefined };
  return { key: node.id, title: nameOf(node.name), sub: node.type === 'set' ? subOf(node) : undefined, to: node.path ?? undefined };
}

/** Lines without repeats: a sefer on two of a Rebbe's shelves (or on his shelf and in a shelf of it) is listed once. */
function once(lines: Line[]): Line[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.to ?? line.key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The library: the Rebbeim, each with his first sefarim, and the other top shelves. */
export async function loadLibrary(api: ChassidusHub) {
  const tree = await api.catalogTree({ depth: 1, limit: 40 });
  const shelves = rebbeimFirst(tree.children.filter((node) => !isEmpty(node)));
  return {
    rebbeim: shelves.filter((node) => isRebbe(node.path)).map(lineOf),
    more: shelves.filter((node) => !isRebbe(node.path)).map(lineOf),
  };
}

/** A Rebbe's or a shelf's page: its shelves and sefarim, then the books that are additions on it. */
export async function loadSet(api: ChassidusHub, id: string) {
  const [tree, bar] = await Promise.all([api.catalogTree({ root: id, depth: 1, limit: 100 }), api.pathBar({ id })]);
  const root = tree.root;
  if (!root) throw new Response('not found', { status: 404 });
  const sefer = onlySefer(root);
  if (sefer?.path) throw redirect(sefer.path);
  const children = root.children ?? [];
  const here = new Set(children.map((child) => child.id));
  return {
    screen: 'set' as const,
    id,
    title: nameOf(root.name, id),
    rebbe: isRebbe(root.path),
    levels: bar.levels,
    lines: once(officialChildren(root).map(lineOf)),
    // Additions to a sefer on this shelf are on that sefer's page; the rest are listed here.
    additions: once(children.filter((child) => child.addition && !(child.addition.to && here.has(child.addition.to))).map(lineOf)),
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

/** The printings of a sefer, read on the server only for a page asked to show a scan (`?scan=`). */
const printingsFor = (api: ChassidusHub, work: string, scan: boolean) => (scan ? api.listLinked({ id: work, field: 'work', type: 'publication', limit: 500 }).then((page) => page.items) : Promise.resolve(null));

/**
 * A sefer's page: its volumes, its additions, and its printings (read by the
 * browser unless a scan was asked for). Everything is read at once, the item
 * itself among them when it was not read already; null when the id is not a
 * sefer's.
 */
export async function loadWork(api: ChassidusHub, id: string, options: { item?: Item; scan?: boolean; apiBase: string }) {
  const [item, bar, outline, additions, publications] = await Promise.all([
    options.item ?? api.getItem({ id }),
    api.pathBar({ id }),
    orNothing(api.workOutline({ id })),
    orNothing(api.listLinked({ id, field: 'addition.to', type: 'work', limit: 100 })),
    printingsFor(api, id, !!options.scan),
  ]);
  if (item.type !== 'work' || !outline) return null;
  const data = item.data as { title?: unknown };
  const author = bar.levels.find((level) => level.kind === 'set' && isRebbe(level.chosen.path));
  const parts = outline.parts.map((part) => ({ value: part.value ?? '', label: partLabel(part.label, part.value ?? ''), units: part.units ?? 0 }));
  return {
    screen: 'work' as const,
    id: item.id,
    path: item.path,
    api: options.apiBase,
    title: nameOf(data.title, item.id),
    author: author ? nameOf(author.chosen.name) : undefined,
    levels: bar.levels,
    grid: asGrid(outline.parts),
    parts,
    printings: publications ? printingsFrom(publications) : null,
    additions: (additions?.items ?? []).map((addition): Line => {
      const kind = (addition.data as { addition?: { kind?: string } }).addition?.kind ?? '';
      return { key: addition.id, title: nameOf((addition.data as { title?: unknown }).title, addition.id), sub: additionKinds[kind] || undefined, to: addition.path ?? undefined };
    }),
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
 * path and its place (/likkutei-sichos/12). Its units, its path bar (the
 * sefer's, and the volume with the other volumes), and its printings.
 */
export async function loadVolume(api: ChassidusHub, workId: string, value: string, options: { scan?: boolean; apiBase: string }) {
  const [work, bar, outline, part, publications] = await Promise.all([
    api.getItem({ id: workId }),
    api.pathBar({ id: workId }),
    orNothing(api.workOutline({ id: workId })),
    orNothing(api.workPart({ id: workId, part: value, limit: 1000 })),
    printingsFor(api, workId, !!options.scan),
  ]);
  const here = outline?.parts.find((p) => p.value === value);
  if (work.type !== 'work' || !here || !part) return null;
  const label = partLabel(here.label, value);
  const title = nameOf((work.data as { title?: unknown }).title, work.id);
  const level: ApiLevel = {
    kind: 'part',
    level: (part.items[0]?.data.position as Array<{ level?: string }> | undefined)?.[0]?.level,
    chosen: { path: `${work.path}/${value}`, name: { he: label }, value },
    choices: outline!.parts.map((p) => ({ path: `${work.path}/${p.value}`, name: { he: partLabel(p.label, p.value ?? '') }, value: p.value ?? '', units: p.units ?? 0 })),
  };
  return {
    screen: 'volume' as const,
    id: work.id,
    path: `${work.path}/${value}`,
    api: options.apiBase,
    title,
    value,
    label,
    levels: [...bar.levels, level],
    units: part.items.map((unit) => ({
      key: unit.id,
      title: nameOf(unit.data.label, unit.path ?? unit.id),
      sub: placeOf(unit.data.position),
      group: groupOf(unit.data.position),
      to: unit.path ?? `/${unit.id}`,
    })),
    printings: publications ? printingsFrom(publications, { value, label }) : null,
  };
}

type Loaded<T extends (...args: never[]) => Promise<unknown>> = NonNullable<Awaited<ReturnType<T>>>;
export type LibraryData = Loaded<typeof loadLibrary>;
export type SetData = Loaded<typeof loadSet>;
export type WorkData = Loaded<typeof loadWork>;
export type VolumeData = Loaded<typeof loadVolume>;
