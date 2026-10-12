import type { ChassidusHub } from '@chassidushub/client';
import { data, redirect } from 'react-router';
import { loadSet, loadVolume, loadWork, type LoadOptions } from './load';

/**
 * A library page at a path: a shelf, a sefer or a volume, from one read of
 * GET /v1/view, which brings a sefer's volumes and additions and a volume's
 * units with it, then the rest of what a shelf's screen draws. For any other
 * item (a sicha, an event), the view read, which routes/item.tsx draws itself.
 *
 * The same for the API and for the catalog snapshot (app/catalog/localApi.ts):
 * the Worker and the browser draw these pages from the snapshot when they
 * hold it, with the very same code, and fall back to the API where the
 * snapshot cannot answer (it throws NotLocal).
 */

/** Whether the API answered "there is nothing there", by its status, not its class: the server's API client and this page's can be two copies of the package. */
export const notFound = (error: unknown) => [404, 400].includes((error as { status?: number } | null)?.status ?? 0);

/** A read the API answered with 404, as nothing; any other failure stays one. */
export const orNothing = <T>(read: Promise<T>): Promise<T | null> => read.catch((error) => (notFound(error) ? null : Promise.reject(error)));

/** The page's path, or a 404 for a broken % escape, which names no item. */
export function pathOf(url: URL): string {
  try {
    return decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
  } catch {
    throw data('not found', { status: 404 });
  }
}

/** `scan` makes a page asked to show a scan (`?scan=`) read its printings on the server; without it the page reads them itself. */
export async function libraryPage(api: ChassidusHub, url: URL, { scan }: { scan?: LoadOptions['scan'] } = {}) {
  const path = pathOf(url);
  const words = path.split('/').filter(Boolean);
  const permanent = /^\/(rh-[\w-]+)$/i.exec(path)?.[1];
  const language = url.searchParams.get('language') ?? undefined;
  const options: LoadOptions = { scan: url.searchParams.has('scan') ? scan : undefined, apiBase: api.baseUrl };
  // GET /v1/view answers a volume (no item of its own) as its sefer with the volume's units, in the one read.
  // The catalog snapshot answers a volume's path "nothing there" instead, and an older API did too: then the sefer is read after it.
  const maybeVolume = !permanent && words.length === 2 && words[0] !== 'sets';
  const view = await orNothing(api.itemView(permanent ? { id: permanent, language } : { path, language }));
  if (!view) {
    const parent = maybeVolume ? await orNothing(api.itemView({ path: `/${words[0]}` })) : null;
    if (parent?.movedTo) throw redirect(`${parent.movedTo}/${words[1]}${url.search}`, 301);
    const volume = parent ? await loadVolume(api, parent, words[1]!, options) : null;
    if (volume) return volume;
    throw data('not found', { status: 404 });
  }
  if (view.movedTo) throw redirect(`${view.movedTo}${url.search}`, 301);
  if (view.volume) {
    const volume = await loadVolume(api, view, view.volume.value, options);
    if (volume) return volume;
    throw data('not found', { status: 404 });
  }
  if (view.item.type === 'set') return await loadSet(api, view.item, view.pathBar);
  if (view.item.type === 'work') {
    const work = await loadWork(api, view, options);
    if (work) return work;
  }
  return { screen: 'view' as const, view };
}
