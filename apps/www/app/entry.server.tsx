import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext } from 'react-router';

/**
 * Pages are rendered as web streams, which Workers and Node both speak, so the
 * same build runs on Cloudflare and in the local server the tests use. People
 * get the page as it renders; bots get it whole.
 */
export default async function handleRequest(request: Request, status: number, headers: Headers, context: EntryContext) {
  let failed = false;
  const body = await renderToReadableStream(<ServerRouter context={context} url={request.url} />, {
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
  return new Response(body, { headers, status: failed ? 500 : status });
}
