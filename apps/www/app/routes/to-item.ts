import { data, redirect } from 'react-router';
import type { Route } from './+types/to-item';

/**
 * The old site's /edit/<id> and /all/<id>, kept for the links already out
 * there: a permanent redirect to the item's own page, where what belongs to
 * it is listed and Edit is (its corner menu; /edit/<id> opens it, ?edit).
 */
export function loader({ request, params }: Route.LoaderArgs) {
  if (!/^rh-[\w-]+$/i.test(params.id)) throw data('not found', { status: 404 });
  const editing = new URL(request.url).pathname.startsWith('/edit/');
  return redirect(`/${params.id}${editing ? '?edit' : ''}`, 301);
}
