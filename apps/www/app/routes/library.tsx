import type { ChassidusHub } from '@chassidushub/client';
import { fromSnapshotOr } from '../catalog/localApi';
import { loadLibrary, loadOtherShelves } from '../library/load';
import { LibraryScreen, OtherShelvesScreen } from '../library/screens';
import type { Route } from './+types/library';

export const handle = { section: 'library' };

export function meta({ location }: Route.MetaArgs) {
  return [{ title: `${location.search.includes('more') ? 'ספרים נוספים' : 'ספרייה'} · ChassidusHub` }];
}

/**
 * The other shelves are not waited for: the page goes out at once and they
 * follow in it. Both are drawn from the catalog snapshot when the server
 * holds it (app/catalog), with no API call.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const read = <T,>(load: (api: ChassidusHub) => Promise<T>) => fromSnapshotOr(context.catalog, context.api, load);
  if (new URL(request.url).searchParams.has('more')) return { screen: 'more' as const, others: read(loadOtherShelves) };
  return { screen: 'library' as const, ...(await read(loadLibrary)) };
}

/** A click to the library, drawn in the browser from the catalog snapshot it keeps (app/catalog/clicks.ts). */
export const clientLoader = ({ request, serverLoader }: Route.ClientLoaderArgs) => import('../catalog/clicks').then((clicks) => clicks.libraryClick(request, serverLoader));

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
