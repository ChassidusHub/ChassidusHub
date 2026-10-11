import type { ChassidusHub } from '@chassidushub/client';
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

/**
 * A volume's page: a path with nothing at it whose parent is a sefer and whose
 * last part is one of the sefer's volumes (/likkutei-sichos/12). Null when it
 * is not one.
 */
async function volumeAt(api: ChassidusHub, path: string) {
  const cut = path.replace(/\/+$/, '').lastIndexOf('/');
  if (cut <= 0) return null;
  const value = path.slice(cut + 1);
  const found = await api.resolvePath({ path: path.slice(0, cut) }).catch((error) => (notFound(error) ? null : Promise.reject(error)));
  if (!found) return null;
  if (found.redirected && found.path) throw redirect(`${found.path}/${value}`, 301);
  const work = await api.getItem({ id: found.id });
  return work.type === 'work' ? loadVolume(api, work, value) : null;
}

/**
 * Every item's page, at its readable path (/likkutei-sichos/12/3) or its
 * permanent one (/rh-7k2m9q4d). An old path that moved answers with a
 * permanent redirect to where it is now. The screen depends on the kind of
 * item: a shelf, a sefer or a volume is the library's, a sicha the Reader's,
 * an event or a recording Home and listening's.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const path = decodeURIComponent(new URL(request.url).pathname);
  const api = context.api;
  try {
    const permanent = /^\/(rh-[\w-]+)\/?$/i.exec(path)?.[1];
    const found = permanent ? { id: permanent, redirected: false, path: null } : await api.resolvePath({ path }).catch((error) => (notFound(error) ? null : Promise.reject(error)));
    if (!found) {
      // Nothing at the path: it may be a volume of a sefer, which is no item of its own.
      const volume = await volumeAt(api, path);
      if (volume) return volume;
      throw data('not found', { status: 404 });
    }
    if (found.redirected && found.path) throw redirect(found.path, 301);
    const item = await api.getItem({ id: found.id });
    if (item.type === 'set') return await loadSet(api, item);
    if (item.type === 'work') return await loadWork(api, item);
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
