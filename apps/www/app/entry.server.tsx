import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type AppLoadContext, type EntryContext } from 'react-router';
import { pageSafety } from './lib/safety';
import { siteOf } from './lib/site';
import { ServerOnly } from './serverOnly';

/**
 * Pages are rendered as web streams, which Workers and Node both speak, so the
 * same build runs on Cloudflare and in the local server the tests use. People
 * get the page as it renders; bots get it whole.
 */
/**
 * How long a page's later parts (a search's answers, streamed after its
 * frame) are waited for before React Router gives them up as failed. Its own
 * 5 s is shorter than a cold search on a busy day takes: the page then said
 * the search did not answer, though the answer was on its way, and the edge
 * kept that page for everyone (#338).
 */
export const streamTimeout = 15_000;

export default async function handleRequest(request: Request, status: number, headers: Headers, context: EntryContext, loadContext: AppLoadContext) {
  let failed = false;
  const body = await renderToReadableStream(
    <ServerOnly.Provider value={loadContext?.serverOnly}>
      <ServerRouter context={context} url={request.url} />
    </ServerOnly.Provider>,
    {
    signal: request.signal,
    onError(error: unknown) {
      failed = true;
      // After the first bytes the status has gone out: the edge is told to forget the page instead (#342).
      loadContext?.failed?.();
      console.error(error);
    },
  });
  if (isbot(request.headers.get('user-agent') ?? '')) await body.allReady;
  headers.set('Content-Type', 'text/html; charset=utf-8');
  // Only chassidushub.org itself is for search engines (lib/site.ts): the beta and previews stay out.
  if (!siteOf(request).indexed) headers.set('X-Robots-Tag', 'noindex');
  for (const [name, value] of Object.entries(pageSafety(new URL(request.url).pathname))) headers.set(name, value);
  return new Response(body, { headers, status: failed ? 500 : status });
}

