import type { ChassidusHub, PathLevel as ApiLevel } from '@chassidushub/client';
import { data } from 'react-router';
import type { PathStep } from '../path';
import { nameOf, pathSteps } from '../reader/load.server';

/** What an item's tool page knows of the item: what it is, its name, its own page, and its path for the path bar. */
export interface ItemHead {
  id: string;
  type: string;
  name: string;
  /** The item's own page: its readable path, else its permanent one. */
  to: string;
  steps: PathStep[];
  rev: number;
  /** Its words are held back for rights: listed, not shown, and not edited here. */
  withheld: boolean;
}

/** Whether the API answered "there is nothing there": by its status, not its class (routes/item.tsx says why). */
export const notFound = (error: unknown) => [404, 400].includes((error as { status?: number } | null)?.status ?? 0);

/** A read the API answered with 404, as nothing; any other failure stays one. */
export const orNothing = <T,>(read: Promise<T>): Promise<T | null> => read.catch((error) => (notFound(error) ? null : Promise.reject(error)));

/** An item's name in Hebrew, from whichever of its fields holds it. */
export const itemName = (item: { id: string; data: unknown }): string => {
  const fields = (item.data ?? {}) as { label?: unknown; title?: unknown; name?: unknown };
  return nameOf(fields.label ?? fields.title ?? fields.name).replace(/<[^>]*>/g, '').trim() || item.id;
};

/**
 * The item a tool page is about, in two reads side by side: the item and its
 * path bar. Not found (a 404 page) when there is no such item, or it is not
 * of the `types` the page is for.
 */
export async function itemHead(api: ChassidusHub, id: string, types?: string[]): Promise<ItemHead> {
  if (!/^rh-[\w-]+$/i.test(id)) throw data('not found', { status: 404 });
  const [item, bar] = await Promise.all([orNothing(api.getItem({ id })), api.pathBar({ id }).catch(() => ({ levels: [] as ApiLevel[] }))]);
  if (!item || (types && !types.includes(item.type))) throw data('not found', { status: 404 });
  const name = itemName(item);
  const to = item.path ?? `/${item.id}`;
  const steps = pathSteps(bar.levels ?? []);
  // An item the path bar does not reach (a scan, a recording) still ends the path, as itself.
  if (!steps.length || !steps.at(-1)!.choices.some((c) => c.current && c.path === to)) {
    steps.push({ key: 'item', title: 'הדף', label: name, choices: [{ path: to, label: name, current: true }] });
  }
  return { id: item.id, type: item.type, name, to, steps, rev: item.rev, withheld: !!item.withheld };
}
