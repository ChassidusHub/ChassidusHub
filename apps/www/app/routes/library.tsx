import { loadLibrary, loadOtherShelves } from '../library/load';
import { LibraryScreen, OtherShelvesScreen } from '../library/screens';
import type { Route } from './+types/library';

export const handle = { section: 'library' };

export function meta({ location }: Route.MetaArgs) {
  return [{ title: `${location.search.includes('more') ? 'ספרים נוספים' : 'ספרייה'} · ChassidusHub` }];
}

/** The other shelves are not waited for: the page goes out at once and they follow in it. */
export async function loader({ request, context }: Route.LoaderArgs) {
  if (new URL(request.url).searchParams.has('more')) return { screen: 'more' as const, others: loadOtherShelves(context.api) };
  return { screen: 'library' as const, ...(await loadLibrary(context.api)) };
}

/**
 * The same page for everyone (who is signed in is asked by the browser), so
 * the edge keeps it (server/pageCache.ts): fresh for two minutes, as the
 * API's own answers are, then shown while it is drawn again behind it.
 */
export const headers = () => ({ 'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=3600' });

/** The library: the Rebbeim and their sefarim, from the fixed catalog tree, then the other shelves. */
export default function Screen({ loaderData }: Route.ComponentProps) {
  return loaderData.screen === 'more' ? <OtherShelvesScreen others={loaderData.others} /> : <LibraryScreen rebbeim={loaderData.rebbeim} />;
}
