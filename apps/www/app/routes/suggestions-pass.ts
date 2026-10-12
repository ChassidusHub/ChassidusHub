import { passTo } from './auth';
import { fromThisSite } from './fix';
import type { Route } from './+types/suggestions-pass';

/**
 * A Suggestion's page as the person: /_/suggestions/<id>… to the API's
 * /v1/suggestions/<id>… with their session, never cached. Reading it as them
 * says whether they may approve it; the rest is what they do on it: comment,
 * review (approve, send back), close and reopen, undo, bring up to date with
 * the clashes decided, ask someone to review, change its title. Only these
 * addresses pass, and anything but reading only from this site's own pages.
 */
const pass = passTo(
  '/v1/suggestions',
  /^\d{1,9}(\/(conversation|comments|reviews|withdraw|reopen|revert|update|merge-check|batch|review-requests(\/[A-Za-z0-9-]{1,39})?))?$/,
);

export const loader = (args: Route.LoaderArgs) => pass(args);

export function action(args: Route.ActionArgs) {
  if (!fromThisSite(args.request)) return Response.json({ error: 'forbidden', message: 'from this site only' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  return pass(args);
}
