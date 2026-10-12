import { lazy } from 'react';
import { data, isRouteErrorResponse, redirect, type AppLoadContext } from 'react-router';
import { nameOf, pathLevels } from '../lib/catalog';
import { libraryPage, notFound } from '../library/page';
import { printingsFrom } from '../library/printings';
import { isLetter, readerData } from '../reader/load.server';
import { farbrengenOf } from '../reader/farbrengen.server';
import { Placeholder } from './placeholder';
import type { Section } from '../ui';
import torahFont from '../ui/fonts/frank-ruehl-clm.woff2?url';
import letterFont from '../ui/fonts/david-clm.woff2?url';
import type { Route } from './+types/item';
import { KEPT_PAGE } from '../lib/caching';

/** Recordings and the events they were said at belong to listening; every other item to the library. */
const listening = new Set(['event', 'recording']);

/**
 * Every item's page, at its readable path (/likkutei-sichos/12/3) or its
 * permanent one (/rh-7k2m9q4d), from one read of GET /v1/view: the item, its
 * path bar, the units before and after it and its best words. An old path
 * that moved answers with a permanent redirect to where it is now. The screen
 * depends on the kind of item: a sicha (a unit) is read here (app/reader); a
 * shelf, a sefer or a volume is the library's (app/library/page.ts), an event
 * or a recording Home and listening's.
 *
 * On the server every page is read from the API, so the edge can tag it with
 * what it shows and forget it when that changes (server/edge.ts); a click in
 * the browser to a shelf, a sefer or a volume is drawn from the catalog
 * snapshot instead (`clientLoader`).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const api = context.api;
  try {
    const page = await libraryPage(api, url, { scan: printingsFrom });
    if (page.screen !== 'view') return page;
    const view = page.view;
    const item = view.item;
    // An event, or one of its recordings, is heard on its listening page.
    if (item.type === 'event' || item.type === 'recording') {
      const to = await listeningPage(item, api);
      if (to) throw redirect(to, 301);
    }
    const fields = item.data as { label?: unknown; title?: unknown; name?: unknown };
    const name = nameOf(fields.label ?? fields.title ?? fields.name) || item.id;
    if (item.type === 'unit') {
      // A farbrengen read as one page (reader/farbrengen.server.ts): its other sichos lead to their place on the first one's page
      // (?sicha says which, by its place), unless sent back to their own address (?alone) after the farbrengen could not be read whole.
      const farbrengen = farbrengenOf(view);
      const at = farbrengen ? farbrengen.sichos.findIndex((s) => s.path === item.path) : -1;
      if (farbrengen && at > 0 && !url.searchParams.has('alone')) throw redirect(`${farbrengen.sichos[0]!.path}?sicha=${at}#u-${item.id}`, 302);
      const reader = await readerData(view, context, url.origin, url.searchParams.get('language') ?? undefined);
      // The farbrengen could not be read whole (a sicha's read failed): the sicha that was asked for, alone, not the first one.
      const asked = farbrengen && !reader.farbrengen ? farbrengen.sichos[Number(url.searchParams.get('sicha'))] : undefined;
      if (asked && asked.path !== item.path) throw redirect(`${asked.path}?alone`, 302);
      const loaded = { screen: 'reader' as const, type: item.type, name, reader };
      // A sicha's words are set in the Torah face, a letter's in David (app/views/letters.tsx): the page asks for it
      // with its first bytes, not once it has drawn. Said in a header, on the server, so it costs the reader's script nothing.
      if (reader.text.kind !== 'words') return loaded;
      const font = isLetter(reader) ? letterFont : torahFont;
      return data(loaded, { headers: { Link: `<${font}>; rel=preload; as=font; type="font/woff2"; crossorigin` } });
    }
    return { screen: 'item' as const, id: item.id, type: item.type, name, pathBar: view.pathBar };
  } catch (error) {
    if (notFound(error)) throw data('not found', { status: 404 });
    throw error;
  }
}

/**
 * The reader and the library's screens are each their own file, read with
 * the page that shows one, so a sicha's page never downloads the library's
 * screens nor a shelf's page the reader, and each page reads as few files as
 * before (#277).
 */
const readerScreen = () => import('../reader/Reader');
const libraryScreens = () => import('../library/screens');
const Reader = lazy(() => readerScreen().then((file) => ({ default: file.Reader })));
const SetScreen = lazy(() => libraryScreens().then((file) => ({ default: file.SetScreen })));
const WorkScreen = lazy(() => libraryScreens().then((file) => ({ default: file.WorkScreen })));
const VolumeScreen = lazy(() => libraryScreens().then((file) => ({ default: file.VolumeScreen })));

/**
 * A click to an item's page: a shelf, a sefer or a volume is drawn in the
 * browser from the catalog snapshot; a sicha shows at once and its words come
 * after, from where they are kept (app/reader/click.ts). The screen's file is
 * read with the page's data, so it is there when the page draws.
 */
export async function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  const page = await import('../reader/click').then((click) => click.sichaClick(request, serverLoader));
  const screen = (page as { screen?: string }).screen;
  await (screen === 'reader' ? readerScreen() : screen === 'set' || screen === 'work' || screen === 'volume' ? libraryScreens() : null);
  return page;
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
 * the edge keeps it until something it shows changes (lib/caching.ts,
 * server/edge.ts).
 */
export const headers = ({ loaderHeaders }: Route.HeadersArgs) => ({
  'Cache-Control': KEPT_PAGE,
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

/**
 * A path with nothing at it inside the site's frame like every other page
 * (this route is inside the shell), so the top bar and the library,
 * listening and search are a tap away, never a bare page (#264). Any other
 * failure goes on to the site's own page for it (root.tsx).
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  return <Placeholder title="הדף לא נמצא" note="" />;
}
