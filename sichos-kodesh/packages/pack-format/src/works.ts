import type { PackEntry } from './manifest.js';

/**
 * The seforim as the pack API publishes them, to add to any pack: every
 * sefer whose text may ship, with its entries exactly as its own text pack
 * carries them (`sk-pack build-work`), grouped into bundles by author so a
 * pack takes a Rebbe's seforim in one choice. An author whose seforim are
 * small goes into "more seforim", so no bundle is a trifle.
 *
 * A sefer whose contents open on named sections (Igros Kodesh's volumes,
 * Tanya's parts) offers them as parts, so a pack takes some of it.
 *
 * In a request, `works` lists bundle ids, work ids, `all`, or a sefer's
 * parts as `<work>:<part>` (`igros-kodesh-rebbe:3`).
 */

/** One of a sefer's top-level sections: a volume, a part. */
export interface WorkPart {
  /** Its place among the sections, from 1. */
  id: string;
  label: { he: string; en: string };
  bytes: number;
  texts: number;
}

export interface ShelfWork {
  id: string;
  title: { he: string; en: string };
  /** The bundle it belongs to. */
  bundle: string;
  /** The catalog's first author id (a Rebbe), when the work has one. */
  author?: string;
  bytes: number;
  /** Its texts (units), not counting the search index. */
  texts: number;
  /** Its sections, when a pack can take some of them; the search index comes only with the whole sefer. */
  parts?: WorkPart[];
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
  /** The authors with seforim on the shelf, in the catalog's order: what a browser switches between. */
  authors?: Array<{ id: string; name: { he: string; en: string } }>;
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
  parts?: WorkPart[];
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
  const authored = new Set(works.map((w) => w.author));
  return {
    bundles,
    works: works.map((w) => ({ id: w.id, title: w.title, bundle: bundleOf.get(w.id)!, ...(w.author ? { author: w.author } : {}), bytes: w.bytes, texts: w.texts, ...(w.parts && w.parts.length > 1 ? { parts: w.parts } : {}) })),
    authors: authors.filter((a) => authored.has(a.id)).map((a) => ({ id: a.id, name: a.name })),
  };
}

/** What a request takes of one sefer: all of it, or some of its parts. */
export interface WorkSelection {
  id: string;
  /** Part ids, in the sefer's order; null for the whole sefer. */
  parts: string[] | null;
}

/** `all`, bundle ids, work ids and `<work>:<part>` to what they take, in shelf order. The whole of a sefer wins over its parts. Throws for a name the shelf lacks. */
export function resolveWorkSelection(spec: string, shelf: WorksShelf): WorkSelection[] {
  const whole = new Set<string>();
  const parts = new Map<string, Set<string>>();
  for (const raw of spec.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const split = /^([^:]+):(.+)$/.exec(token);
    if (split) {
      const work = shelf.works.find((w) => w.id === split[1]);
      if (!work?.parts?.some((p) => p.id === split[2])) throw new Error(`no part "${split[2]}" of "${split[1]}" is published`);
      parts.set(work.id, (parts.get(work.id) ?? new Set()).add(split[2]!));
    } else if (token === 'all') for (const w of shelf.works) whole.add(w.id);
    else if (shelf.bundles.some((b) => b.id === token)) for (const id of shelf.bundles.find((b) => b.id === token)!.works) whole.add(id);
    else if (shelf.works.some((w) => w.id === token)) whole.add(token);
    else throw new Error(`no sefer or bundle "${token}" is published`);
  }
  return shelf.works.flatMap((w): WorkSelection[] => {
    if (whole.has(w.id)) return [{ id: w.id, parts: null }];
    const picked = parts.get(w.id);
    if (!picked) return [];
    // Every part picked is the whole sefer (and its search index).
    if (w.parts && w.parts.every((p) => picked.has(p.id))) return [{ id: w.id, parts: null }];
    return [{ id: w.id, parts: (w.parts ?? []).filter((p) => picked.has(p.id)).map((p) => p.id) }];
  });
}

/** The work ids a request names, whole or in part, in shelf order. */
export function resolveWorks(spec: string, shelf: WorksShelf): string[] {
  return resolveWorkSelection(spec, shelf).map((s) => s.id);
}

/** A few names by name, a long list by count. */
function someOf(names: string[], many: { he: string; en: string }, lang: 'he' | 'en'): string {
  return names.length <= 3 ? names.join(', ') : `${names.length} ${many[lang]}`;
}

/** The label of what a request takes: the bundles it fills, the seforim, and a sefer's parts ("Igros Kodesh · Volume 3, Volume 4"). */
export function worksLabel(selection: WorkSelection[] | string[], shelf: WorksShelf): { he: string; en: string } {
  const picked: WorkSelection[] = selection.map((s) => (typeof s === 'string' ? { id: s, parts: null } : s));
  const whole = picked.filter((s) => !s.parts).map((s) => s.id);
  if (whole.length === shelf.works.length) return { he: 'כל הספרים', en: 'All the seforim' };
  const bundles = shelf.bundles.filter((b) => b.works.every((id) => whole.includes(id)));
  const label = (lang: 'he' | 'en') =>
    [
      ...bundles.map((b) => b.label[lang]),
      ...picked
        .filter((s) => !bundles.some((b) => !s.parts && b.works.includes(s.id)))
        .map((s) => {
          const work = shelf.works.find((w) => w.id === s.id)!;
          if (!s.parts) return work.title[lang];
          const names = s.parts.map((id) => work.parts!.find((p) => p.id === id)!.label[lang]);
          return `${work.title[lang]} · ${someOf(names, { he: 'חלקים', en: 'parts' }, lang)}`;
        }),
    ].join(', ');
  return { he: label('he'), en: label('en') };
}

export function isWorksEntry(entry: PackEntry): boolean {
  return entry.collection === 'works';
}
