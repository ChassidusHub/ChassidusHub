import type { TreeNode } from '@chassidushub/client';

/**
 * Organizing the catalog (`/organize`), apart from its drawing so it can be
 * tested: which rows are picked, the new order a list is put in, and the plan
 * of operations it all becomes, which POST /v1/organize (core's organize.ts)
 * takes as one Suggestion. Nothing here talks to the API.
 */

export type { TreeNode };

/** One step of a plan, as POST /v1/organize reads it. */
export type Operation =
  | { op: 'move'; items: string[]; to: string | null; from?: string }
  | { op: 'move-up'; items: string[]; from?: string }
  | { op: 'rename'; item: string; name?: { he?: string; en?: string }; slug?: string }
  | { op: 'reorder'; items: string[]; parent?: string | null }
  | { op: 'create-set'; key: string; name: { he: string; en?: string }; slug: string; parent?: string | null; items?: string[] }
  | { op: 'delete-set'; item: string }
  | { op: 'merge'; from: string; into: string };

/** The rows of one kind under what is organized, put in order among themselves. */
export interface Group {
  key: 'sets' | 'works' | 'units' | 'others';
  title: string;
  /** Whose children they are, for a reorder; null for the library's top sets. */
  parent: string | null;
  orderable: boolean;
  nodes: TreeNode[];
}

/**
 * What is under the root, in groups: at the top, the library's sets; in a
 * set, the sets under it, then its sefarim, then anything else in it; in a
 * sefer, its sichos and chapters.
 */
export function groupsOf(root: TreeNode | null, children: TreeNode[]): Group[] {
  if (!root) return [{ key: 'sets', title: 'סטים', parent: null, orderable: true, nodes: children.filter((c) => c.type === 'set') }];
  if (root.type === 'work') return [{ key: 'units', title: 'שיחות ופרקים', parent: root.id, orderable: true, nodes: children }];
  return [
    { key: 'sets' as const, title: 'סטים', parent: root.id, orderable: true, nodes: children.filter((c) => c.type === 'set') },
    { key: 'works' as const, title: 'ספרים', parent: root.id, orderable: true, nodes: children.filter((c) => c.type === 'work') },
    { key: 'others' as const, title: 'עוד בסט', parent: root.id, orderable: false, nodes: children.filter((c) => c.type !== 'set' && c.type !== 'work') },
  ].filter((group) => group.nodes.length > 0);
}

/** A row's box pressed: it alone turns on or off; with shift, every row from the last one pressed to this one takes its new state. */
export function pick(order: readonly string[], picked: ReadonlySet<string>, id: string, shift: boolean, last: string | null): Set<string> {
  const next = new Set(picked);
  const on = !picked.has(id);
  const [a, b] = [order.indexOf(last ?? ''), order.indexOf(id)];
  const span = shift && a >= 0 && b >= 0 ? order.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
  for (const row of span) {
    if (on) next.add(row);
    else next.delete(row);
  }
  return next;
}

/** The picked rows one place up (-1) or down (1) together, each keeping its place among them; at the end of the list, nothing moves. */
export function step(list: readonly string[], moving: readonly string[], by: -1 | 1): string[] {
  const out = [...list];
  const chosen = new Set(moving);
  const at = out.flatMap((id, i) => (chosen.has(id) ? [i] : []));
  if (!at.length || (by < 0 ? at[0] === 0 : at[at.length - 1] === out.length - 1)) return out;
  for (const i of by < 0 ? at : at.reverse()) [out[i], out[i + by]] = [out[i + by]!, out[i]!];
  return out;
}

/** The dragged rows put just before `before` (null: at the end), each keeping its place among them. */
export function dropAt(list: readonly string[], dragged: readonly string[], before: string | null): string[] {
  const moving = new Set(dragged);
  if (before !== null && moving.has(before)) return [...list];
  const rest = list.filter((id) => !moving.has(id));
  const block = list.filter((id) => moving.has(id));
  const at = before === null ? rest.length : Math.max(0, rest.indexOf(before));
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** The items an operation takes out of the list they are in, so a new order of that list leaves them out. */
function takenOut(op: Operation): string[] {
  if (op.op === 'move') return op.from !== undefined || op.to === null ? op.items : [];
  if (op.op === 'move-up') return op.items;
  if (op.op === 'merge') return [op.from];
  if (op.op === 'delete-set') return [op.item];
  if (op.op === 'create-set') return op.items ?? [];
  return [];
}

/** The whole plan: the steps chosen, then one reorder for each list whose order changed, of what is still in it. */
export function planOf(steps: readonly Operation[], groups: readonly Group[], orders: Readonly<Record<string, readonly string[]>>): Operation[] {
  const gone = new Set(steps.flatMap(takenOut));
  const plan = [...steps];
  for (const group of groups) {
    const now = orders[group.key];
    const before = group.nodes.map((n) => n.id);
    if (!group.orderable || !now || now.join() === before.join()) continue;
    const items = now.filter((id) => !gone.has(id));
    if (items.length > 1) plan.push({ op: 'reorder', items, parent: group.parent });
  }
  return plan;
}

/** An address's last part from a name in Latin letters, as the catalog's paths are made. */
export function slugOf(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** One step in plain words, for the list of changes. */
export function said(op: Operation, name: (id: string) => string): string {
  const these = (ids: readonly string[]) => (ids.length === 1 ? name(ids[0]!) : `${ids.length} פריטים`);
  switch (op.op) {
    case 'move':
      if (op.to === null) return op.from ? `הוצאת ${these(op.items)} מ${name(op.from)}` : `העברת ${these(op.items)} לראש הספרייה`;
      return `העברת ${these(op.items)} אל ${name(op.to)}${op.from ? '' : ' (גם)'}`;
    case 'move-up':
      return `העלאת ${these(op.items)} רמה אחת`;
    case 'rename': {
      const to = [op.name?.he, op.name?.en].filter(Boolean).join(' / ');
      return `שינוי שם ${name(op.item)}${to ? ` ל${to}` : ''}${op.slug ? ` (${op.slug})` : ''}`;
    }
    case 'reorder':
      return `סדר חדש ל${these(op.items)}`;
    case 'create-set':
      return `סט חדש: ${op.name.he}${op.items?.length ? `, עם ${these(op.items)}` : ''}`;
    case 'delete-set':
      return `מחיקת הסט הריק ${name(op.item)}`;
    case 'merge':
      return `מיזוג ${name(op.from)} אל ${name(op.into)}`;
  }
}

/** What a row holds, in a few words: "3 סטים · 12 פריטים". */
export function holds(node: TreeNode): string {
  const parts: string[] = [];
  if (node.counts.sets) parts.push(`${node.counts.sets} סטים`);
  if (node.counts.items) parts.push(`${node.counts.items} פריטים`);
  if (node.counts.units) parts.push(`${node.counts.units} יחידות`);
  return parts.join(' · ');
}

export const KINDS: Record<string, string> = { set: 'סט', work: 'ספר', unit: 'שיחה', event: 'התוועדות', recording: 'הקלטה', publication: 'הוצאה', person: 'אדם', text: 'טקסט', scan: 'סריקה' };


/** What POST /v1/organize/preview answers: the change, saved nowhere. */
export interface Preview {
  title: string;
  items: { id: string; type: string; name: string; isNew: boolean; deleted: boolean; pathBefore: string | null; path: string | null; changes: { path: string; before?: unknown; after?: unknown }[] }[];
  redirects: { id: string; from: string; to: string | null }[];
  warnings: string[];
}

/** What POST /v1/organize answers: the one Suggestion made, and whether it is in the catalog already. */
export interface Sent {
  suggestion: { id: number; number?: number | null; status: string; title: string };
  merged: boolean;
  mayApprove?: boolean;
}
