import { escapeXml, fileResponse, siteOf } from '../lib/site';
import type { Route } from './+types/sitemap-index';

/** The sitemaps (sitemaps.org): the site's own pages, then every kind of item a page at a time (the API's /v1/sitemap), each with when it last changed. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { origin } = siteOf(request);
  const { sitemaps } = await context.api.sitemaps();
  const newest = sitemaps.map((s) => s.lastmod).filter((m): m is string => Boolean(m)).sort().at(-1);
  const entry = (name: string, lastmod?: string | null) => `  <sitemap><loc>${escapeXml(`${origin}/sitemaps/${name}.xml`)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</sitemap>`;
  const entries = [entry('pages', newest), ...sitemaps.map((s) => entry(`${s.type}-${s.page}`, s.lastmod))];
  return fileResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>\n`, 'application/xml');
}
