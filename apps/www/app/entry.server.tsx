import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type AppLoadContext, type EntryContext } from 'react-router';
import { pageSafety } from './lib/safety';
import { ServerOnly } from './serverOnly';

/**
 * Pages are rendered as web streams, which Workers and Node both speak, so the
 * same build runs on Cloudflare and in the local server the tests use. People
 * get the page as it renders; bots get it whole.
 */
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
      console.error(error);
    },
  });
  if (isbot(request.headers.get('user-agent') ?? '')) await body.allReady;
  headers.set('Content-Type', 'text/html; charset=utf-8');
  // The beta stays out of search engines until the switch-over gives it chassidushub.org.
  headers.set('X-Robots-Tag', 'noindex');
  for (const [name, value] of Object.entries(pageSafety(new URL(request.url).pathname))) headers.set(name, value);
  return new Response(body, { headers, status: failed ? 500 : status });
}

