import { redirect } from 'react-router';
import type { Route } from './+types/from-app';
import { siteOf } from '../lib/context.server.js';
import { langFrom } from '../lib/i18n.js';
import { href } from '../lib/links.js';

/**
 * Where the reader app's "Suggest a fix" and "Report a problem" land
 * (its app-core fixLinks.ts): `/_/app/edit` or `/_/app/report`, naming the
 * item by the app's own ids (`?farbrengen=<mafteiach number>`, or
 * `?work=<id>&unit=<id>`). The API finds the item; a fix opens its edit
 * page, a report a new report about it. An item it cannot find, or the app
 * itself, opens a new report with nothing chosen, so nothing a reader
 * wanted to say is lost.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  if (params.action !== 'edit' && params.action !== 'report') throw new Response('Not found', { status: 404 });
  const { api } = siteOf(context);
  const lang = langFrom(request);
  const query = new URL(request.url).searchParams;
  const ids = { farbrengen: query.get('farbrengen') ?? undefined, work: query.get('work') ?? undefined, unit: query.get('unit') ?? undefined };
  const item = ids.farbrengen || ids.work ? await api.appItem(ids).catch(() => null) : null;
  if (item && params.action === 'edit') throw redirect(href(`/edit/${item.id}`, lang));
  throw redirect(href('/issues/new', lang, { item: item?.id }));
}
