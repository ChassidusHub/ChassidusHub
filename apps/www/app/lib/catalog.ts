import type { PathChoice, PathLevel as ApiLevel, TreeNode } from '@chassidushub/client';
import type { MenuItem, PathLevel } from '../ui';

/**
 * What the library screens and the path bar need to know about the catalog:
 * names in Hebrew, which top shelves are the Rebbeim, and how the API's path
 * (GET /v1/entities/{id}/path-bar) becomes the path bar at the top of a page.
 */

/** An item's name in Hebrew where it has one: a plain string, or one per language. Markup some imports left in names is dropped. */
export function nameOf(name: unknown, fallback = ''): string {
  return plainName(name) || fallback;
}

function plainName(name: unknown): string {
  if (typeof name === 'string') return name.replace(/<[^>]*>/g, '').trim();
  if (name && typeof name === 'object') {
    const names = name as Record<string, unknown>;
    const found = names.he ?? names.en ?? Object.values(names).find((v) => typeof v === 'string');
    if (typeof found === 'string') return plainName(found);
  }
  return '';
}

/**
 * The Rebbeim, in order: the fixed top of the catalog tree. Their shelves come
 * first in the library and in the path bar; every other top shelf is under
 * "ספרים נוספים".
 */
export const REBBEIM = [
  '/sets/baal-shem-tov',
  '/sets/maggid',
  '/sets/alter-rebbe',
  '/sets/mitteler-rebbe',
  '/sets/tzemach-tzedek',
  '/sets/rebbe-maharash',
  '/sets/rebbe-rashab',
  '/sets/frierdiker-rebbe',
  '/sets/the-rebbe',
];

const rebbeAt = (path: string | null) => (path ? REBBEIM.indexOf(path) : -1);
export const isRebbe = (path: string | null) => rebbeAt(path) >= 0;

/** The Rebbeim first, in their order, then the other shelves as the catalog keeps them. */
export function rebbeimFirst<T extends { path: string | null }>(items: T[]): T[] {
  const rank = (item: T) => {
    const at = rebbeAt(item.path);
    return at < 0 ? REBBEIM.length : at;
  };
  return items.map((item, at) => ({ item, at })).sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at).map(({ item }) => item);
}

/** A shelf with nothing on it (old shelves the catalog has emptied): not shown. */
export const isEmpty = (node: TreeNode) => node.type === 'set' && !node.counts.sets && !node.counts.items;

/** A sefer that belongs to another one (a commentary, an index, a collection) rather than standing on the shelf itself. */
export const isAddition = (node: TreeNode) => !!node.addition;

/** The official sefarim and shelves under a shelf, in the catalog's order: what its row lists. */
export function officialChildren(node: TreeNode): TreeNode[] {
  return (node.children ?? []).filter((child) => !isAddition(child) && !isEmpty(child));
}

/**
 * A shelf that holds exactly one official sefer and no shelves (the Rebbe's
 * "לקוטי שיחות" shelf, holding Likkutei Sichos and its additions) is that
 * sefer: its row, its menu choice and its page go straight to the sefer.
 * A Rebbe's own shelf never is, even with one sefer on it.
 */
export function onlySefer(node: TreeNode): TreeNode | null {
  if (node.type !== 'set' || node.counts.sets || isRebbe(node.path)) return null;
  const works = officialChildren(node).filter((child) => child.type === 'work');
  return works.length === 1 && (node.children ?? []).every((child) => child.type === 'work') ? works[0]! : null;
}

/** The first level of every library page's path: the library itself, beside listening. */
export function libraryLevel(): PathLevel {
  return {
    key: 'place',
    label: 'ספרייה',
    icon: 'library',
    title: 'מקום',
    items: [
      { key: 'library', label: 'ספרייה', to: '/library', current: true },
      { key: 'listen', label: 'שמיעה', to: '/listen' },
    ],
  };
}

/** A level's menu choices: each goes to its page, the one the path takes marked. */
function choicesOf(level: ApiLevel, choices: PathChoice[] = level.choices): MenuItem[] {
  return choices.map((choice, at) => ({
    key: choice.id ?? `${choice.value ?? at}`,
    label: nameOf(choice.name, choice.value ?? ''),
    to: choice.path ?? undefined,
    current: sameChoice(choice, level.chosen),
    end: level.kind === 'part' && choice.units ? String(choice.units) : undefined,
    also: choice.value,
  }));
}

const sameChoice = (a: PathChoice, b: PathChoice) => (a.id && b.id ? a.id === b.id : a.value !== undefined && a.value === b.value);

/** What a level's menu is called: the Rebbeim, the sefarim of a Rebbe, the volumes of a sefer. */
function titleOf(level: ApiLevel, above: ApiLevel | undefined): string {
  const parent = above ? nameOf(above.chosen.name) : '';
  if (level.kind === 'set' && !above) return 'הספרייה';
  if (level.kind === 'set' || level.kind === 'work') return parent ? `ספרי ${parent}` : 'ספרים';
  if (level.kind === 'part') return parent ? `חלקי ${parent}` : 'חלקים';
  return parent ? `ב${parent}` : '';
}

/**
 * The path bar of a library page from the API's levels: the library first,
 * then the Rebbe (or other top shelf), his shelves, the sefer, its volume and
 * the unit, each a menu of the other choices there. A shelf holding one
 * official sefer and the sefer on it read as one level, named for the sefer
 * ("ליקוטי שיחות", not "לקוטי שיחות › לקוטי שיחות"), whose menu is the other
 * shelves; a shelf there with one sefer opens at that sefer (its page sends
 * it on). The top level lists the Rebbeim first.
 */
export function pathLevels(levels: ApiLevel[]): PathLevel[] {
  const out: PathLevel[] = [libraryLevel()];
  for (let at = 0; at < levels.length; at++) {
    const level = levels[at]!;
    const above = levels[at - 1];
    const next = levels[at + 1];
    const key = `${level.kind}-${at}`;
    if (above && level.kind === 'set' && next?.kind === 'work' && next.choices.length === 1) {
      // The shelf and its one sefer, as one level.
      const items = choicesOf(level).map((item) => (item.current ? { ...item, to: next.chosen.path ?? item.to } : item));
      out.push({ key, label: nameOf(next.chosen.name), title: titleOf(level, above), items });
      at++;
      continue;
    }
    const choices = level.kind === 'set' && !above ? rebbeimFirst(level.choices) : level.choices;
    out.push({ key, label: nameOf(level.chosen.name, level.chosen.value ?? ''), title: titleOf(level, above), items: choicesOf(level, choices) });
  }
  return out;
}

/** "חלק י״ב" for a volume's place, where the catalog gave it no label. */
export function partLabel(label: unknown, value: string): string {
  return nameOf(label) || `חלק ${value}`;
}
