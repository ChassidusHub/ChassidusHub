import { loadLibrary, loadOtherShelves } from '../library/load';
import { LibraryScreen, OtherShelvesScreen } from '../library/screens';
import type { Route } from './+types/library';
import { KEPT_PAGE } from '../lib/caching';

export const handle = { section: 'library' };

export function meta({ location }: Route.MetaArgs) {
  return [{ title: `${location.search.includes('more') ? 'ספרים נוספים' : 'ספרייה'} · ChassidusHub` }];
}

/**
 * The other shelves are not waited for: the page goes out at once and they
 * follow in it.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  if (new URL(request.url).searchParams.has('more')) return { screen: 'more' as const, others: loadOtherShelves(context.api) };
  return { screen: 'library' as const, ...(await loadLibrary(context.api)) };
}

/** A click to the library, drawn in the browser from the catalog snapshot it keeps (app/catalog/clicks.ts). */
export const clientLoader = ({ request, serverLoader }: Route.ClientLoaderArgs) => import('../catalog/clicks').then((clicks) => clicks.libraryClick(request, serverLoader));

/**
 * The same page for everyone (who is signed in is asked by the browser), so
 * the edge keeps it until something it shows changes (lib/caching.ts,
 * server/edge.ts).
 */
export const headers = () => ({ 'Cache-Control': KEPT_PAGE });

/** The library: the Rebbeim and their sefarim, from the fixed catalog tree, then the other shelves. */
export default function Screen({ loaderData }: Route.ComponentProps) {
  return loaderData.screen === 'more' ? <OtherShelvesScreen others={loaderData.others} /> : <LibraryScreen rebbeim={loaderData.rebbeim} />;
}
