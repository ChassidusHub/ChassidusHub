import type { AppLoadContext } from 'react-router';

/**
 * Who is asking, from the API (GET /v1/auth/me with their session cookie), for
 * a server route that only some may use (/_/showcases: the platform's admin).
 * Null when nobody is signed in or the API cannot say.
 */
export async function personOf(request: Request, context: AppLoadContext): Promise<{ id: string; admin?: boolean; steward?: boolean } | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie || !context.forward) return null;
  try {
    const answer = await context.forward('/v1/auth/me', new Request(new URL('/_/auth/me', request.url), { headers: { cookie, accept: 'application/json' } }));
    if (!answer.ok) return null;
    return ((await answer.json()) as { person?: { id: string; admin?: boolean; steward?: boolean } | null }).person ?? null;
  } catch {
    return null;
  }
}
