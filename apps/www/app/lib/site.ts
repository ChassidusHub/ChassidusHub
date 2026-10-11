/**
 * Where the site is answering from. Only chassidushub.org itself is for
 * search engines: the beta (new.chassidushub.org), a preview or a local
 * server stays hidden (X-Robots-Tag, robots.txt). So the switch-over is
 * only the address: once the new site answers chassidushub.org it is
 * indexed, and moving the address back hides it again.
 */
export const MAIN_HOST = 'chassidushub.org';

export function siteOf(request: Request): { origin: string; indexed: boolean } {
  const url = new URL(request.url);
  return { origin: url.origin, indexed: url.hostname === MAIN_HOST };
}

export const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** A file the site makes (robots.txt, a sitemap), kept at the edge for `seconds`. */
export const fileResponse = (body: string, type: string, seconds = 3600) =>
  new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=86400` } });
