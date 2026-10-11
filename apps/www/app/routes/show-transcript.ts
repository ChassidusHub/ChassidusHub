import { PRIVATE } from '../stewards/showcase';
import type { Route } from './+types/show-transcript';

/**
 * A showcase's transcript, for its guest's page (routes/show.tsx): only of a
 * recording the showcase lists, and only its words and timings, not who is
 * waiting to fix them. Never in a shared cache or a search engine.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const showcase = await context.showcases?.get(params.token).catch(() => null);
  if (!showcase || !showcase.transcripts.includes(params.recording)) return new Response('Not found', { status: 404, headers: PRIVATE });
  const transcript = (await context.api.recordingTranscript({ id: params.recording }).catch(() => null)) as (Record<string, unknown> & { pending?: unknown }) | null;
  if (!transcript) return new Response('Not found', { status: 404, headers: PRIVATE });
  const { pending: _pending, ...words } = transcript;
  return Response.json(words, { headers: { ...PRIVATE, 'Cache-Control': 'private, max-age=300' } });
}
