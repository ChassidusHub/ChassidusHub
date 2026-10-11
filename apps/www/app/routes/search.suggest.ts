import { suggestions } from '../search/search.server';
import type { Route } from './+types/search.suggest';

/** The rows under the search box while typing (GET /search/suggest?q=), as JSON for the Search screen. */
export async function loader({ request }: Route.LoaderArgs) {
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 200) ?? '';
  const hits = query.length >= 2 ? await suggestions(query) : [];
  return Response.json(hits, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
}
