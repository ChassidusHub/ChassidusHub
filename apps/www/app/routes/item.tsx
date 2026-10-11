import { data, redirect } from 'react-router';
import { loadSet, loadVolume, loadWork } from '../library/load';
import { SetScreen, VolumeScreen, WorkScreen } from '../library/screens';
import { nameOf } from '../lib/catalog';
import type { Section } from '../ui';
import { Placeholder } from './placeholder';
import type { Route } from './+types/item';

/** Recordings and the events they were said at belong to listening; every other item to the library. */
const listening = new Set(['event', 'recording']);

/** Whether the API answered "there is nothing there", by its status, not its class: the server's API client and this page's can be two copies of the package. */
const notFound = (error: unknown) => (error as { status?: number } | null)?.status === 404;


/** A read the API answered with 404, as nothing; any other failure stays one. */
const orNothing = <T,>(read: Promise<T>): Promise<T | null> => read.catch((error) => (notFound(error) ? null : Promise.reject(error)));

/**
 * Every item's page, at its readable path (/likkutei-sichos/12/3) or its
 * permanent one (/rh-7k2m9q4d). An old path that moved answers with a
 * permanent redirect to where it is now. The screen depends on the kind of
 * item: a shelf, a sefer or a volume is the library's, a sicha the Reader's,
 * an event or a recording Home and listening's.
 *
 * Reads go out together wherever the path tells enough to guess: a shelf is
 * under /sets/, a sefer's path is one word (/likkutei-sichos), and a path of
 * two words may be a volume of a sefer, which is no item of its own
 * (/likkutei-sichos/12): its sefer is resolved beside it. So a library page
 * waits on two rounds of reads, not four.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
  const words = path.split('/').filter(Boolean);
  const api = context.api;
  const options = { scan: url.searchParams.has('scan'), apiBase: api.baseUrl };
  try {
    const permanent = /^\/(rh-[\w-]+)$/i.exec(path)?.[1];
    const shelf = path.startsWith('/sets/');
    const maybeVolume = !permanent && !shelf && words.length === 2;
    const [found, parent] = await Promise.all([
      permanent ? { id: permanent, redirected: false, path: null } : orNothing(api.resolvePath({ path })),
      maybeVolume ? orNothing(api.resolvePath({ path: `/${words[0]}` })) : null,
    ]);
    if (!found) {
      // Nothing at the path: it may be a volume of a sefer.
      if (parent?.redirected && parent.path) throw redirect(`${parent.path}/${words[1]}`, 301);
      const volume = parent ? await loadVolume(api, parent.id, words[1]!, options) : null;
      if (volume) return volume;
      throw data('not found', { status: 404 });
    }
    if (found.redirected && found.path) throw redirect(found.path, 301);
    if (shelf) return await loadSet(api, found.id);
    if (words.length === 1 && !permanent) {
      const work = await loadWork(api, found.id, options);
      if (work) return work;
    }
    const item = await api.getItem({ id: found.id });
    if (item.type === 'set') return await loadSet(api, item.id);
    if (item.type === 'work') {
      const work = await loadWork(api, item.id, { ...options, item });
      if (work) return work;
    }
    return { screen: 'item' as const, id: item.id, type: item.type, name: nameOf(item.data.title ?? item.data.label ?? item.data.name, item.id) };
  } catch (error) {
    if (notFound(error)) throw data('not found', { status: 404 });
    throw error;
  }
}

type Loaded = Awaited<ReturnType<typeof loader>>;

export const handle = { section: (loaded: Loaded | undefined): Section => (loaded?.screen === 'item' && listening.has(loaded.type) ? 'listen' : 'library') };

function titleOf(loaded: Loaded): string {
  if (loaded.screen === 'item') return loaded.name;
  if (loaded.screen === 'volume') return `${loaded.title} · ${loaded.label}`;
  return loaded.title;
}

export function meta({ data: loaded }: Route.MetaArgs) {
  return [{ title: loaded ? `${titleOf(loaded)} · ChassidusHub` : 'ChassidusHub' }];
}

export default function Item({ loaderData }: Route.ComponentProps) {
  switch (loaderData.screen) {
    case 'set':
      return <SetScreen data={loaderData} />;
    case 'work':
      return <WorkScreen data={loaderData} />;
    case 'volume':
      return <VolumeScreen data={loaderData} />;
    default:
      return (
        <Placeholder title={loaderData.name}>
          <p className="faint sm">
            {loaderData.type} · <bdi>{loaderData.id}</bdi>
          </p>
        </Placeholder>
      );
  }
}
