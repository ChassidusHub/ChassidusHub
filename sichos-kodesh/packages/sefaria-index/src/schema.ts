import type { Names } from '@sichos-kodesh/works';
import type { SefariaIndex, SefariaNode } from './types.js';

/**
 * Walking an index's schema. A text on Sefaria is either one jagged array
 * (Ma'aneh Lashon: chapter, paragraph) or a tree of named nodes whose
 * leaves are jagged arrays (Tanya: part, then the title page, the
 * approbations, the foreword and 53 chapters). A leaf's ref is the index
 * title and the English titles of the nodes above it, joined with ", ";
 * a `default` node takes its parent's ref.
 */

export interface Leaf {
  ref: string;
  /** Slugs of the named nodes from the index down to this leaf; a default node adds none. */
  path: string[];
  /** Their titles, outermost first. */
  labels: { he: string[]; en: string[] };
  depth: number;
  sectionNames: string[];
  heSectionNames: string[];
  /** How many segments each top-level section holds (0: empty), when the index says. */
  sectionSizes: number[] | null;
}

/** The schema in its own order: a leaf, or a named part holding more. */
export type OutlineEntry = { leaf: Leaf } | { title: Names; entries: OutlineEntry[] };

export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function primary(node: SefariaNode, lang: 'en' | 'he'): string | undefined {
  return node.titles?.find((t) => t.primary && t.lang === lang)?.text;
}

/** A node's titles: its own, else its primary ones, else its shared term (`Noach`), else its key. */
export function nodeTitle(node: SefariaNode): Names {
  const en = node.title || primary(node, 'en') || node.sharedTitle || node.key || '';
  const he = node.heTitle || primary(node, 'he') || en;
  return { he, en };
}

function deepSum(value: unknown): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + deepSum(item), 0);
  return 0;
}

function sectionSizes(node: SefariaNode): number[] | null {
  if ((node.depth ?? 1) < 2 || !Array.isArray(node.content_counts)) return null;
  return node.content_counts.map(deepSum);
}

/** Sefaria's usual section names in Hebrew, for a schema that leaves them out (the raw index does). */
const HEBREW_SECTION_NAMES: Readonly<Record<string, string>> = {
  Chapter: 'פרק',
  Paragraph: 'פסקה',
  Siman: 'סימן',
  Seif: 'סעיף',
  Section: 'סעיף',
  Letter: 'אות',
  Verse: 'פסוק',
  Page: 'דף',
};

function leafOf(node: SefariaNode, ref: string, path: string[], labels: Leaf['labels']): Leaf {
  const sectionNames = node.sectionNames ?? [];
  return {
    ref,
    path,
    labels,
    depth: node.depth ?? 1,
    sectionNames,
    heSectionNames: node.heSectionNames ?? sectionNames.map((name) => HEBREW_SECTION_NAMES[name] ?? name),
    sectionSizes: sectionSizes(node),
  };
}

function walk(node: SefariaNode, ref: string, path: string[], labels: Leaf['labels']): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const used = new Set<string>();
  for (const [index, child] of (node.nodes ?? []).entries()) {
    if (child.default) {
      entries.push(...(child.nodes?.length ? walk(child, ref, path, labels) : [{ leaf: leafOf(child, ref, path, labels) }]));
      continue;
    }
    const title = nodeTitle(child);
    let key = slug(child.key || title.en) || String(index + 1);
    while (used.has(key)) key = `${key}-${index + 1}`;
    used.add(key);
    const childRef = `${ref}, ${title.en}`;
    const childPath = [...path, key];
    const childLabels = { he: [...labels.he, title.he], en: [...labels.en, title.en] };
    if (child.nodes?.length) {
      entries.push({ title, entries: walk(child, childRef, childPath, childLabels) });
    } else {
      const leaf = leafOf(child, childRef, childPath, childLabels);
      // A one-level leaf is a single unit; a deeper one is a part holding its sections.
      entries.push(leaf.depth < 2 ? { leaf } : { title, entries: [{ leaf }] });
    }
  }
  return entries;
}

/**
 * An index's outline. `prefix` places a companion text (Sources and
 * References on Torah Ohr) under its own slug and title inside the work.
 */
export function outline(index: SefariaIndex, prefix?: { key: string; title: Names }): OutlineEntry[] {
  const path = prefix ? [prefix.key] : [];
  const labels = prefix ? { he: [prefix.title.he], en: [prefix.title.en] } : { he: [], en: [] };
  const root = index.schema;
  const entries = root.nodes?.length ? walk(root, index.title, path, labels) : [{ leaf: leafOf(root, index.title, path, labels) }];
  return prefix ? [{ title: prefix.title, entries }] : entries;
}

/** Every leaf of an outline, in order. */
export function leaves(entries: readonly OutlineEntry[]): Leaf[] {
  return entries.flatMap((entry) => ('leaf' in entry ? [entry.leaf] : leaves(entry.entries)));
}
