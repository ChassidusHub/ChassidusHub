import { loadLibrary } from '../library/load';
import { LibraryScreen } from '../library/screens';
import type { Route } from './+types/library';

export const handle = { section: 'library' };

export function meta({ location }: Route.MetaArgs) {
  return [{ title: `${location.search.includes('more') ? 'ספרים נוספים' : 'ספרייה'} · ChassidusHub` }];
}

export async function loader({ context }: Route.LoaderArgs) {
  return loadLibrary(context.api);
}

/** The library: the Rebbeim and their sefarim, from the fixed catalog tree, then the other shelves. */
export default function Screen({ loaderData }: Route.ComponentProps) {
  return <LibraryScreen data={loaderData} />;
}
