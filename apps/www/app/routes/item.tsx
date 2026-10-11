import { data, redirect, type AppLoadContext } from 'react-router';
import { loadSet, loadVolume, loadWork } from '../library/load';
import { SetScreen, VolumeScreen, WorkScreen } from '../library/screens';
import { pathLevels } from '../path';
import { nameOf, pathSteps, readerData } from '../reader/load.server';
import { Reader } from '../reader/Reader';
import type { Section } from '../ui';
import { Placeholder } from './placeholder';
import torahFont from '../ui/fonts/frank-ruehl-clm.woff2?url';
import type { Route } from './+types/item';

/** Recordings and the events they were said at belong to listening; every other item to the library. */
const listening = new Set(['event', 'recording']);

/** Whether the API answered "there is nothing there", by its status, not its class: the server's API client and this page's can be two copies of the package. */
const notFound = (error: unknown) => [404, 400].includes((error as { status?: number } | null)?.status ?? 0);

/** A read the API answered with 404, as nothing; any other failure stays one. */
const orNothing = <T,>(read: Promise<T>): Promise<T | null> => read.catch((error) => (notFound(error) ? null : Promise.reject(error)));

/**
 * Every item's page, at its readable path (/likkutei-sichos/12/3) or its
 * permanent one (/rh-7k2m9q4d), from one read of GET /v1/view: the item, its
 * path bar, the units before and after it and its best words. An old path
 * that moved answers with a permanent redirect to where it is now. The screen
 * depends on the kind of item: a sicha (a unit) is read here (app/reader); a
 * shelf, a sefer or a volume is the library's (app/library), an event or a
 * recording Home and listening's.
 *
 * A path of two words may be a volume of a sefer, which is no item of its own
 * (/likkutei-sichos/12), so its sefer's view is read beside it. Whatever else
 * a library screen draws is read together after that, so it waits on two
 * rounds of reads.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
  } catch {
    // A broken % escape names no item.
    throw data('not found', { status: 404 });
  }
  const words = path.split('/').filter(Boolean);
  const api = context.api;
  const permanent = /^\/(rh-[\w-]+)$/i.exec(path)?.[1];
  const language = url.searchParams.get('language') ?? undefined;
  const options = { scan: url.searchParams.has('scan'), apiBase: api.baseUrl };
  const maybeVolume = !permanent && words.length === 2 && words[0] !== 'sets';
  try {
    const [view, parent] = await Promise.all([
      orNothing(api.itemView(permanent ? { id: permanent, language } : { path, language })),
      maybeVolume ? orNothing(api.itemView({ path: `/${words[0]}` })) : null,
    ]);
    if (!view) {
      // Nothing at the path: it may be a volume of a sefer.
      if (parent?.movedTo) throw redirect(`${parent.movedTo}/${words[1]}${url.search}`, 301);
      const volume = parent ? await loadVolume(api, parent.item, parent.pathBar, words[1]!, options) : null;
      if (volume) return volume;
      throw data('not found', { status: 404 });
    }
    if (view.movedTo) throw redirect(`${view.movedTo}${url.search}`, 301);
    const item = view.item;
    // An event, or one of its recordings, is heard on its listening page.
    if (item.type === 'event' || item.type === 'recording') {
      const to = await listeningPage(item, api);
      if (to) throw redirect(to, 301);
    }
    if (item.type === 'set') return await loadSet(api, item, view.pathBar);
    if (item.type === 'work') {
      const work = await loadWork(api, item, view.pathBar, options);
      if (work) return work;
    }
    const fields = item.data as { label?: unknown; title?: unknown; name?: unknown };
    const name = nameOf(fields.label ?? fields.title ?? fields.name) || item.id;
    if (item.type === 'unit') {
      const reader = await readerData(view, context, url.origin);
      const loaded = { screen: 'reader' as const, type: item.type, name, reader };
      // A sicha's words are set in the Torah face: the page asks for it with its first bytes, not once it has drawn.
      // Said in a header, on the server, so it costs the reader's script nothing.
      if (reader.text.kind !== 'words') return loaded;
      return data(loaded, { headers: { Link: `<${torahFont}>; rel=preload; as=font; type="font/woff2"; crossorigin` } });
    }
    return { screen: 'item' as const, id: item.id, type: item.type, name, pathBar: pathSteps(view.pathBar) };
  } catch (error) {
    if (notFound(error)) throw data('not found', { status: 404 });
    throw error;
  }
}

/** Where an event or recording is heard: /listen/<year>/<event>, a recording picked with ?r=. */
async function listeningPage(item: { id: string; type: string; data: unknown }, api: AppLoadContext['api']): Promise<string | null> {
  const fields = item.data as { date?: string; event?: string };
  const event = item.type === 'event' ? { id: item.id, date: fields.date } : fields.event ? { id: fields.event, date: ((await api.getItem({ id: fields.event }).catch(() => null))?.data as { date?: string } | undefined)?.date } : null;
  const year = event?.date?.slice(0, 4);
  return event && year ? `/listen/${year}/${event.id}${item.type === 'recording' ? `?r=${item.id}` : ''}` : null;
}

/**
 * The same page for everyone (who is signed in is asked by the browser), so
 * the edge keeps it (server/pageCache.ts): fresh for two minutes, as the
 * API's own answers are, then shown while it is drawn again behind it.
 */
export const headers = ({ loaderHeaders }: Route.HeadersArgs) => ({
  'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=3600',
  ...(loaderHeaders.has('Link') ? { Link: loaderHeaders.get('Link')! } : {}),
});

type Loaded = Route.ComponentProps['loaderData'];

export const handle = { section: (loaded: Loaded | undefined): Section => (loaded && 'type' in loaded && listening.has(loaded.type) ? 'listen' : 'library') };

function titleOf(loaded: Loaded): string {
  if (loaded.screen === 'item' || loaded.screen === 'reader') return loaded.name;
  if (loaded.screen === 'volume') return `${loaded.title} · ${loaded.label}`;
  return loaded.title;
}

export function meta({ data: loaded }: Route.MetaArgs) {
  return [{ title: loaded ? `${titleOf(loaded)} · ChassidusHub` : 'ChassidusHub' }];
}

export default function Item({ loaderData }: Route.ComponentProps) {
  switch (loaderData.screen) {
    case 'reader':
      return <Reader key={loaderData.reader.path} data={loaderData.reader} />;
    case 'set':
      return <SetScreen data={loaderData} />;
    case 'work':
      return <WorkScreen data={loaderData} />;
    case 'volume':
      return <VolumeScreen data={loaderData} />;
    default:
      // Events and recordings: their thread's screens, until they are built.
      return (
        <Placeholder title={loaderData.name} path={loaderData.pathBar.length ? pathLevels(loaderData.pathBar) : undefined}>
          <p className="faint sm">
            {loaderData.type} · <bdi>{loaderData.id}</bdi>
          </p>
        </Placeholder>
      );
  }
}
