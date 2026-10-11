import type { Route } from './+types/auth';

/**
 * Signing in, at the site's own address: /_/auth/* goes on to the API's
 * /v1/auth/*, so the browser talks only to this site and the session cookie
 * the API sets is this site's own. The API checks the request's Origin
 * itself; its redirects (to Google and back) go to the browser as they are.
 * Never cached.
 */
async function pass({ request, params, context }: Route.LoaderArgs | Route.ActionArgs) {
  const path = params['*'] ?? '';
  if (!/^[a-z/-]+$/.test(path) || !context.forward) return new Response('Not found', { status: 404 });
  let response: Response;
  try {
    response = await context.forward(`/v1/auth/${path}`, request);
  } catch (error) {
    console.error('auth', error);
    return Response.json({ error: 'upstream', message: 'down' }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
  const headers = new Headers({ 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
  for (const cookie of response.headers.getSetCookie()) headers.append('set-cookie', cookie);
  const location = response.headers.get('location');
  if (location) headers.set('location', location);
  return new Response(location ? null : await response.text(), { status: response.status, headers });
}

export const loader = pass;
export const action = pass;
