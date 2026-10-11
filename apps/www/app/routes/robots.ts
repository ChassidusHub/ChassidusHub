import { siteOf, fileResponse } from '../lib/site.js';

/**
 * What crawlers may read (lib/site.ts says where that is at all). Every
 * item and list is open to all of them, AI crawlers among them (/llms.txt
 * is for those). Kept out: what is someone's own (the account, their
 * fixes), the back room, signing in and connecting apps, the site's
 * passages to the API (/_/), and search, which has no end to it and says
 * nothing an item's page does not.
 */
export const DISALLOWED = ['/_/', '/account', '/me/', '/back$', '/back?', '/signin', '/oauth/', '/search'] as const;

export function robotsTxt(origin: string, indexed: boolean): string {
  if (!indexed) return ['# This address stays out of search engines; the site itself is chassidushub.org.', 'User-agent: *', 'Disallow: /', ''].join('\n');
  return ['User-agent: *', 'Allow: /', ...DISALLOWED.map((path) => `Disallow: ${path}`), '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

export function loader({ request }: { request: Request }) {
  const { origin, indexed } = siteOf(request);
  return fileResponse(robotsTxt(origin, indexed), 'text/plain', 86400);
}
