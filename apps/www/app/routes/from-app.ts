import { redirect } from 'react-router';
import type { Route } from './+types/from-app';

/**
 * Where the reader app's "Suggest a fix" and "Report a problem" land
 * (`/_/app/edit`, `/_/app/report`), naming the item by the app's own ids
 * (`?farbrengen=<mafteiach number>`, or `?work=<id>&unit=<id>`). The API
 * finds the item. On the new site a fix is made on the item's own page
 * (select the words, Fix), so a fix opens that page; a report opens a new
 * report about it. An item it cannot find opens a new report with nothing
 * chosen, so nothing a reader wanted to say is lost.
 */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  if (params.action !== 'edit' && params.action !== 'report') throw new Response('Not found', { status: 404 });
  const query = new URL(request.url).searchParams;
  const ids = { farbrengen: query.get('farbrengen') ?? undefined, work: query.get('work') ?? undefined, unit: query.get('unit') ?? undefined };
  const item = ids.farbrengen || ids.work || ids.unit ? await context.api.appItem(ids).catch(() => null) : null;
  const headers = { 'Cache-Control': 'no-store' };
  if (item && params.action === 'edit') throw redirect(item.path || `/${item.id}`, { headers });
  throw redirect(item ? `/issues/new?item=${encodeURIComponent(item.id)}` : '/issues/new', { headers });
}
