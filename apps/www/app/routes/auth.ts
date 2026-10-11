import type { AppLoadContext } from 'react-router';

/**
 * Signing in, at the site's own address: /_/auth/* goes on to the API's
 * /v1/auth/*, so the browser talks only to this site and the session cookie
 * the API sets is this site's own. The API checks the request's Origin
 * itself; its redirects (to Google and back) go to the browser as they are.
 * Never cached.
 */
/** A pass-through to the API's `base`, for the paths under it that `allowed` lets by. */
export function passTo(base: string, allowed: RegExp) {
  return async ({ request, params, context }: { request: Request; params: { '*'?: string }; context: AppLoadContext }) => {
    const path = params['*'] ?? '';
    if (!allowed.test(path) || !context.forward) return new Response('Not found', { status: 404 });
    let response: Response;
    try {
      response = await context.forward(path ? `${base}/${path}` : base, request);
    } catch (error) {
      console.error(base, error);
      return Response.json({ error: 'upstream', message: 'down' }, { status: 502, headers: { 'cache-control': 'no-store' } });
    }
    const headers = new Headers({ 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
    for (const cookie of response.headers.getSetCookie()) headers.append('set-cookie', cookie);
    const location = response.headers.get('location');
    if (location) headers.set('location', location);
    return new Response(location ? null : await response.text(), { status: response.status, headers });
  };
}

const pass = passTo('/v1/auth', /^[a-z/-]+$/);
export const loader = pass;
export const action = pass;
