import { redirect } from 'react-router';
import type { Route } from './+types/review';

/**
 * The old site's /review (what waits for review) is a part of the back room
 * now (thread 6): suggestions waiting for a keeper, live fixes to keep or undo,
 * and machine text to check, in one place. `?s=<id>` (one opened there) goes
 * to that suggestion's own page.
 */
export function loader({ request }: Route.LoaderArgs) {
  const id = new URL(request.url).searchParams.get('s');
  if (id && /^\d{1,9}$/.test(id)) return redirect(`/suggestions/i${id}`, 301);
  return redirect('/back?tab=waiting', 301);
}
