import { pageWords } from '../reader/load.server';
import { wordsAddress, wordsKey } from '../reader/words.server';
import type { Route } from './+types/words';

/** Kept for good by the browser, the service worker and the edge: what is at this address never changes. */
const FOREVER = 'public, max-age=31536000, s-maxage=31536000, immutable';

/**
 * A sicha's words, drawn as the reader shows them, at an address made from
 * the words themselves: GET /_/words/<id>/<key>?language=<version>, answered
 * with `{ body, notes }`. The key is the words' hash (reader/words.server.ts),
 * so this address only ever holds these words, and is kept for good.
 *
 * When the words have changed since the key was made (a fix, a newer
 * version), the address sends on to the words as they are now, never kept,
 * so an older page still gets words, never the wrong ones under this key.
 */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const language = new URL(request.url).searchParams.get('language') ?? undefined;
  const nothing = () => new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
  if (!/^rh-[\w-]+$/i.test(params.id) || !/^[0-9a-f]{20}$/.test(params.key)) return nothing();
  const view = await context.api.itemView({ id: params.id, language }).catch((error: { status?: number }) => {
    if ([404, 400].includes(error?.status ?? 0)) return null;
    throw error;
  });
  const words = view ? (await pageWords(view, context.api, language)).words : null;
  if (!view || !words) return nothing();
  const key = await wordsKey(words);
  if (key !== params.key) return new Response(null, { status: 302, headers: { Location: wordsAddress(view.item.id, key, language), 'Cache-Control': 'no-store' } });
  return Response.json(words, { headers: { 'Cache-Control': FOREVER } });
}
