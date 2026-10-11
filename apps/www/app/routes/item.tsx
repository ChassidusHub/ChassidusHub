import { data, redirect } from 'react-router';
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
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
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
  const fields = view.item.data as { label?: unknown; title?: unknown; name?: unknown };
  const name = nameOf(fields.label ?? fields.title ?? fields.name) || view.item.id;
  if (view.item.type === 'unit') return { kind: 'reader' as const, type: view.item.type, name, reader: await readerData(view, context, url.origin) };
  return { kind: 'item' as const, id: view.item.id, type: view.item.type, name, pathBar: pathSteps(view.pathBar) };
}

/** "Something is wrong here", from the reader's corner menu. */
export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const note = String(form.get('note') ?? '')
    .trim()
    .slice(0, 2000);
  const entityId = String(form.get('id') ?? '');
  if (form.get('intent') !== 'report' || !note) return { error: 'כתבו מה לא בסדר.' };
  try {
    await context.api.report({ body: { entityId, reason: 'other', note } });
    return { ok: true };
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 403) return { error: 'כדי לדווח צריך להיכנס לחשבון.' };
    if (status === 429) return { error: 'נשלחו מכאן הרבה דיווחים בשעה האחרונה. נסו שוב מאוחר יותר.' };
    return { error: 'השליחה לא הצליחה. נסו שוב.' };
  }
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
