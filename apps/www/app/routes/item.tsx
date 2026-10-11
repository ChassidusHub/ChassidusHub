import { data, redirect, type AppLoadContext } from 'react-router';
import { pathLevels } from '../path';
import { nameOf, pathSteps, readerData } from '../reader/load.server';
import { Reader } from '../reader/Reader';
import type { Section } from '../ui';
import { Placeholder } from './placeholder';
import type { Route } from './+types/item';

/** Recordings and the events they were said at belong to listening; every other item to the library. */
const listening = new Set(['event', 'recording']);

/**
 * Every item's page, at its readable path (/likkutei-sichos/12/3) or its
 * permanent one (/rh-7k2m9q4d), from one read of GET /v1/view: the item, its
 * path bar, the units before and after it and its best words. An old path
 * that moved answers with a permanent redirect to where it is now. The screen
 * depends on the kind of item: a sicha (a unit) is read here (app/reader); a
 * shelf, a sefer or a volume is the Library thread's, an event or a recording
 * Home and listening's.
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
  const permanent = /^\/(rh-[\w-]+)$/i.exec(path)?.[1];
  const language = url.searchParams.get('language') ?? undefined;
  let view;
  try {
    view = await context.api.itemView(permanent ? { id: permanent, language } : { path, language });
  } catch (error) {
    // By its status, not its class: the server's API client and this page's can be two copies of the package.
    const status = (error as { status?: number } | null)?.status;
    if (status === 404 || status === 400) throw data('not found', { status: 404 });
    throw error;
  }
  if (view.movedTo) throw redirect(`${view.movedTo}${url.search}`, 301);
  // An event, or one of its recordings, is heard on its listening page.
  if (view.item.type === 'event' || view.item.type === 'recording') {
    const to = await listeningPage(view.item, context.api);
    if (to) throw redirect(to, 301);
  }
  const fields = view.item.data as { label?: unknown; title?: unknown; name?: unknown };
  const name = nameOf(fields.label ?? fields.title ?? fields.name) || view.item.id;
  if (view.item.type === 'unit') return { kind: 'reader' as const, type: view.item.type, name, reader: await readerData(view, context, url.origin) };
  return { kind: 'item' as const, id: view.item.id, type: view.item.type, name, pathBar: pathSteps(view.pathBar) };
}

/** Where an event or recording is heard: /listen/<year>/<event>, a recording picked with ?r=. */
async function listeningPage(item: { id: string; type: string; data: unknown }, api: AppLoadContext['api']): Promise<string | null> {
  const fields = item.data as { date?: string; event?: string };
  const event = item.type === 'event' ? { id: item.id, date: fields.date } : fields.event ? { id: fields.event, date: ((await api.getItem({ id: fields.event }).catch(() => null))?.data as { date?: string } | undefined)?.date } : null;
  const year = event?.date?.slice(0, 4);
  return event && year ? `/listen/${year}/${event.id}${item.type === 'recording' ? `?r=${item.id}` : ''}` : null;
}

export const handle = { section: (loaded: Awaited<ReturnType<typeof loader>> | undefined): Section => (loaded && listening.has(loaded.type) ? 'listen' : 'library') };

export function meta({ data: loaded }: Route.MetaArgs) {
  return [{ title: loaded ? `${loaded.name} · ChassidusHub` : 'ChassidusHub' }];
}

export default function Item({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === 'reader') return <Reader key={loaderData.reader.path} data={loaderData.reader} />;
  // Shelves, sefarim, volumes, events and recordings: their threads' screens, until they are built.
  return (
    <Placeholder title={loaderData.name} path={loaderData.pathBar.length ? pathLevels(loaderData.pathBar) : undefined}>
      <p className="faint sm">
        {loaderData.type} · <bdi>{loaderData.id}</bdi>
      </p>
    </Placeholder>
  );
}
