import { mediaAddress, PRIVATE } from '../stewards/showcase';
import type { Route } from './+types/show-media';

/**
 * One of a showcase's files, by its place in the list fixed when it was saved
 * (a recording, a sicha's scan, a farbrengen's written original): the guest
 * is sent where it is served. Only a file the showcase lists; anything else
 * is not found.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const showcase = await context.showcases?.get(params.token).catch(() => null);
  const at = Number(params.n);
  const source = showcase && Number.isInteger(at) ? showcase.media[at] : undefined;
  if (!showcase || !source) return new Response('Not found', { status: 404, headers: PRIVATE });
  const original = Object.values(showcase.originals ?? {}).includes(at);
  return new Response(null, { status: 302, headers: { ...PRIVATE, Location: mediaAddress(source, context.api.baseUrl, original) } });
}
