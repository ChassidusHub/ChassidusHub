import { dateLabel, eventPath, eventsIn, YEARS } from '../listen/data.server';
import type { Route } from './+types/listen-menu';

/** The path bar's event level on a recording page: the other events of that year with recordings. */
export async function loader({ params, context: { api } }: Route.LoaderArgs) {
  const year = Number(params.year);
  if (!YEARS.includes(year)) throw new Response('not found', { status: 404 });
  const events = await eventsIn(api, year);
  const items = events.map((e) => ({ key: e.id, label: e.data.title?.he?.trim() || dateLabel(e.data.date), to: eventPath(e) }));
  return Response.json(items, { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=3600' } });
}
