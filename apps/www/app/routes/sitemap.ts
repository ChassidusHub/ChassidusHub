import { data, redirect } from 'react-router';
import { DOC_PAGES, docAddress } from '../developers/pages';
import { escapeXml, fileResponse, siteOf } from '../lib/site';
import type { Route } from './+types/sitemap';

/** The site's own pages worth finding: the main ones, the catalog as a whole, and every page of the developer docs. */
const PAGES = ['/', '/library', '/listen', '/about', '/connect', '/takedown', '/health', '/status', '/missing', '/projects', '/mirrors', '/models', ...DOC_PAGES.map((page) => docAddress(page.slug))];

const TYPES = ['set', 'author', 'person', 'work', 'unit', 'event', 'publication', 'recording'] as const;
type ItemType = (typeof TYPES)[number];

/** `unit-3` is units' third page, `pages` the site's own; `work` (before sitemaps were paged) is works' first. */
function nameOf(name: string): { kind: 'pages' } | { kind: 'items'; type: ItemType; page: number } | { kind: 'legacy'; type: ItemType } | null {
  if (name === 'pages') return { kind: 'pages' };
  const paged = /^([a-z]+)-([1-9][0-9]{0,5})$/.exec(name);
  const type = (paged?.[1] ?? name) as ItemType;
  if (!TYPES.includes(type)) return null;
  return paged ? { kind: 'items', type, page: Number(paged[2]) } : { kind: 'legacy', type };
}

const urlset = (entries: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
const url = (loc: string, lastmod?: string | null) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`;

/** One sitemap: the site's own pages, or one page of one kind of item (at most 10,000, well inside the protocol's 50,000). The site is Hebrew only, so one address each. */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { origin } = siteOf(request);
  const name = nameOf(params.name ?? '');
  if (!name) throw data('not found', { status: 404 });
  if (name.kind === 'legacy') throw redirect(`/sitemaps/${name.type}-1.xml`, 301);
  if (name.kind === 'pages') return fileResponse(urlset(PAGES.map((path) => url(`${origin}${path}`))), 'application/xml');
  const page = await context.api.sitemapPage({ type: name.type, page: name.page }).catch(() => null);
  if (!page) throw data('not found', { status: 404 });
  return fileResponse(urlset(page.items.map((item) => url(`${origin}${item.path ?? `/${item.id}`}`, item.lastmod))), 'application/xml');
}
