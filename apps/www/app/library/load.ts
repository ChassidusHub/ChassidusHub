import type { ChassidusHub, Item, PathLevel as ApiLevel, TreeNode } from '@chassidushub/client';
import { redirect } from 'react-router';
import { isEmpty, isRebbe, nameOf, officialChildren, onlySefer, partLabel, rebbeimFirst } from '../lib/catalog';

/**
 * What the library's pages read from the API, cut down on the server to what
 * they draw, so a page carries no more than it shows. Each page reads in at
 * most two rounds: the item, then everything about it at once. The tree is
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

/** A printing of a sefer or a volume (a publication), and where its scan can be read. */
export interface Printing {
  key: string;
  title: string;
  /** A place to read the scan: an embeddable PDF (Google Drive), or a page elsewhere. */
  scans: Array<{ label: string; url: string; embed?: string }>;
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
export async function loadSet(api: ChassidusHub, item: Item) {
  const [tree, bar] = await Promise.all([api.catalogTree({ root: item.id, depth: 1, limit: 100 }), api.pathBar({ id: item.id })]);
  const root = tree.root;
  if (!root) throw new Response('not found', { status: 404 });
  const sefer = onlySefer(root);
  if (sefer?.path) throw redirect(sefer.path);
  const children = root.children ?? [];
  const here = new Set(children.map((child) => child.id));
  return {
    screen: 'set' as const,
    id: item.id,
    title: nameOf(root.name, item.id),
    rebbe: isRebbe(root.path),
    levels: bar.levels,
    lines: once(officialChildren(root).map(lineOf)),
    // Additions to a sefer on this shelf are on that sefer's page; the rest are listed here.
    additions: once(children.filter((child) => child.addition && !(child.addition.to && here.has(child.addition.to))).map(lineOf)),
  };
}

/** What an addition is to its sefer, as its row's quiet line says it. */
const additionKinds: Record<string, string> = { commentary: 'ביאור', index: 'מפתח', about: 'על הספר', collection: 'ליקוט', other: '' };

/** Every printing of a sefer, with the scans of each that can be read. */
async function printingsOf(api: ChassidusHub, work: string) {
  const { items } = await api.listLinked({ id: work, field: 'work', type: 'publication', limit: 500 });
  return items;
}

/** A Google Drive file's address in its embeddable form, or nothing for any other address. */
function driveEmbed(url: string): string | undefined {
  const id = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)/.exec(url)?.[1];
  return id ? `https://drive.google.com/file/d/${id}/preview` : undefined;
}

const sourceNames: Record<string, string> = { hebrewbooks: 'HebrewBooks', other: '' };

function printingOf(publication: Item): Printing {
  const data = publication.data as { title?: unknown; volume?: string; sources?: Array<{ url?: string; note?: string; source?: string }> };
  const scans = (data.sources ?? [])
    .filter((s): s is { url: string; note?: string; source?: string } => typeof s.url === 'string' && /^https:\/\//.test(s.url))
    .map((s) => ({ label: sourceNames[s.source ?? ''] || s.note || new URL(s.url).hostname, url: s.url, embed: driveEmbed(s.url) }));
  return { key: publication.id, title: nameOf(data.title, publication.id), scans };
}

/** Letters only: "י״ב", "יב" and "יב (ויקרא)" all come to "יב". */
const letters = (text: string) => (text.replace(/^חלק\s+/, '').split(/[\s(]/)[0] ?? '').replace(/[״׳"']/g, '');

/** Whether a printing is of one volume: its volume is "12", or "יב (ויקרא)" for חלק י״ב. */
function ofVolume(publication: Item, value: string, label: string): boolean {
  const volume = String((publication.data as { volume?: unknown }).volume ?? '');
  if (!volume) return false;
  if (volume === value) return true;
  const hebrew = letters(label);
  return !!hebrew && letters(volume) === hebrew;
}

/** The words in a printing's title after the sefer's name: "לקוטי שיחות - יב (ויקרא)" is ויקרא. */
const aboutOf = (title: string) => /\(([^)]+)\)\s*$/.exec(title)?.[1]?.replace(/\s+-\s+/g, ' · ');

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

/** A sefer's page: its volumes, its printings and the additions to it. */
export async function loadWork(api: ChassidusHub, item: Item) {
  const [bar, outline, additions, printings] = await Promise.all([
    api.pathBar({ id: item.id }),
    api.workOutline({ id: item.id }),
    api.listLinked({ id: item.id, field: 'addition.to', type: 'work', limit: 100 }),
    printingsOf(api, item.id),
  ]);
  const data = item.data as { title?: unknown };
  const author = bar.levels.find((level) => level.kind === 'set' && isRebbe(level.chosen.path));
  const parts = outline.parts.map((part) => ({ value: part.value ?? '', label: partLabel(part.label, part.value ?? ''), units: part.units ?? 0 }));
  return {
    screen: 'work' as const,
    id: item.id,
    path: item.path,
    title: nameOf(data.title, item.id),
    author: author ? nameOf(author.chosen.name) : undefined,
    levels: bar.levels,
    grid: asGrid(outline.parts),
    parts,
    printings: printings.map(printingOf).filter((p) => p.scans.length),
    additions: additions.items.map((addition): Line => {
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
export async function loadVolume(api: ChassidusHub, work: Item, value: string) {
  const [bar, outline, part, printings] = await Promise.all([
    api.pathBar({ id: work.id }),
    api.workOutline({ id: work.id }),
    api.workPart({ id: work.id, part: value, limit: 1000 }),
    printingsOf(api, work.id),
  ]);
  const here = outline.parts.find((p) => p.value === value);
  if (!here) throw new Response('not found', { status: 404 });
  const label = partLabel(here.label, value);
  const title = nameOf((work.data as { title?: unknown }).title, work.id);
  const level: ApiLevel = {
    kind: 'part',
    level: part.items[0] ? ((part.items[0].data.position as Array<{ level?: string }> | undefined)?.[0]?.level ?? undefined) : undefined,
    chosen: { path: `${work.path}/${value}`, name: { he: label }, value },
    choices: outline.parts.map((p) => ({ path: `${work.path}/${p.value}`, name: { he: partLabel(p.label, p.value ?? '') }, value: p.value ?? '', units: p.units ?? 0 })),
  };
  const mine = printings.filter((p) => ofVolume(p, value, label)).map(printingOf);
  return {
    screen: 'volume' as const,
    id: work.id,
    path: `${work.path}/${value}`,
    title,
    label,
    about: mine.map((p) => aboutOf(p.title)).find(Boolean),
    levels: [...bar.levels, level],
    units: part.items.map((unit) => ({
      key: unit.id,
      title: nameOf(unit.data.label, unit.path ?? unit.id),
      sub: placeOf(unit.data.position),
      group: groupOf(unit.data.position),
      to: unit.path ?? `/${unit.id}`,
    })),
    printings: mine.filter((p) => p.scans.length),
  };
}

export type LibraryData = Awaited<ReturnType<typeof loadLibrary>>;
export type SetData = Awaited<ReturnType<typeof loadSet>>;
export type WorkData = Awaited<ReturnType<typeof loadWork>>;
export type VolumeData = Awaited<ReturnType<typeof loadVolume>>;
