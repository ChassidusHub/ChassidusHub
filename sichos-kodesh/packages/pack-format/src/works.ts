import type { PackEntry } from './manifest.js';

/**
 * The seforim as the pack API publishes them, to add to any pack: every
 * sefer whose text may ship, with its entries exactly as its own text pack
 * carries them (`sk-pack build-work`), grouped into bundles by author so a
 * pack takes a Rebbe's seforim in one choice. An author whose seforim are
 * small goes into "more seforim", so no bundle is a trifle.
 *
 * In a request, `works` lists bundle ids, work ids, or `all`.
 */

export interface ShelfWork {
  id: string;
  title: { he: string; en: string };
  /** The bundle it belongs to. */
  bundle: string;
  bytes: number;
  /** Its texts (units), not counting the search index. */
  texts: number;
}

export interface WorkBundle {
  id: string;
  label: { he: string; en: string };
  works: string[];
  bytes: number;
}

export interface WorksShelf {
  bundles: WorkBundle[];
  works: ShelfWork[];
}

/** An author's seforim under this size join the "more seforim" bundle. */
export const MIN_BUNDLE_BYTES = 10 * 1024 * 1024;
export const MORE_BUNDLE_ID = 'more';

export interface ShelfInput {
  id: string;
  title: { he: string; en: string };
  /** The catalog's first author id, when the work has one. */
  author?: string;
  bytes: number;
  texts: number;
}

/** Bundles by author, in the order `authors` lists them; the small ones and the authorless share one "more seforim" bundle. */
export function bundleWorks(works: ShelfInput[], authors: Array<{ id: string; name: { he: string; en: string } }>): WorksShelf {
  const groups = new Map<string, ShelfInput[]>();
  for (const work of works) {
    const key = work.author && authors.some((a) => a.id === work.author) ? work.author : MORE_BUNDLE_ID;
    groups.set(key, [...(groups.get(key) ?? []), work]);
  }
  const bytesOf = (list: ShelfInput[]) => list.reduce((sum, w) => sum + w.bytes, 0);
  const bundles: WorkBundle[] = [];
  const more: ShelfInput[] = groups.get(MORE_BUNDLE_ID) ?? [];
  for (const author of authors) {
    const list = groups.get(author.id);
    if (!list) continue;
    if (bytesOf(list) < MIN_BUNDLE_BYTES) {
      more.push(...list);
      continue;
    }
    bundles.push({ id: author.id, label: { he: `ספרי ${author.name.he}`, en: `${author.name.en}'s seforim` }, works: list.map((w) => w.id), bytes: bytesOf(list) });
  }
  if (more.length > 0) bundles.push({ id: MORE_BUNDLE_ID, label: { he: 'עוד ספרים', en: 'More seforim' }, works: more.map((w) => w.id), bytes: bytesOf(more) });
  const bundleOf = new Map(bundles.flatMap((b) => b.works.map((id) => [id, b.id] as const)));
  return {
    bundles,
    works: works.map((w) => ({ id: w.id, title: w.title, bundle: bundleOf.get(w.id)!, bytes: w.bytes, texts: w.texts })),
  };
}

/** `all`, bundle ids and work ids to the work ids they name, in shelf order. Throws for a name the shelf lacks. */
export function resolveWorks(spec: string, shelf: WorksShelf): string[] {
  const wanted = new Set<string>();
  for (const raw of spec.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    if (token === 'all') for (const w of shelf.works) wanted.add(w.id);
    else if (shelf.bundles.some((b) => b.id === token)) for (const id of shelf.bundles.find((b) => b.id === token)!.works) wanted.add(id);
    else if (shelf.works.some((w) => w.id === token)) wanted.add(token);
    else throw new Error(`no sefer or bundle "${token}" is published`);
  }
  return shelf.works.map((w) => w.id).filter((id) => wanted.has(id));
}

/** The label of a set of seforim: the bundles it fills, or its titles. */
export function worksLabel(ids: string[], shelf: WorksShelf): { he: string; en: string } {
  if (ids.length === shelf.works.length) return { he: 'כל הספרים', en: 'All the seforim' };
  const whole = shelf.bundles.filter((b) => b.works.every((id) => ids.includes(id)));
  const rest = shelf.works.filter((w) => ids.includes(w.id) && !whole.some((b) => b.works.includes(w.id)));
  return {
    he: [...whole.map((b) => b.label.he), ...rest.map((w) => w.title.he)].join(', '),
    en: [...whole.map((b) => b.label.en), ...rest.map((w) => w.title.en)].join(', '),
  };
}

export function isWorksEntry(entry: PackEntry): boolean {
  return entry.collection === 'works';
}
