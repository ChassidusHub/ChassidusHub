import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { extractHtmlLiteral } from '../htmlLiteral.js';
import type { RevalidationResult } from '../httpClient.js';

/**
 * How the section pages arrive. Every mafteiach page has a `.js` twin
 * (`/likkutei_sichos/by_volume/1.js`, `/maamorim.js?order=by_year&year=5711`)
 * carrying the same markup as the HTML page - side-nav included - wrapped
 * in JavaScript, in one of three shapes the site's controllers use:
 *
 *   1. `let html = "..."; window.setOuterHTMLWithScripts(...)` - a JSON
 *      string literal (farbrengen listings and fragments, maamorim, the
 *      /all/moadim and /all/parshiyos views); `extractHtmlLiteral` reads it.
 *   2. `setOuterHTMLWithScripts(document..., \`...\`)` - a template literal
 *      (Likkutei Sichos, hadranim, michtavim klolim).
 *   3. Plain HTML (yomanim: the `.js` route renders the page itself).
 *
 * `sectionHtml` turns any of the three into markup, so the parsers and
 * the fixtures never care which controller served a page.
 */

export const BASE_URL = 'https://www.mafteiach.app';

/** The one method the section crawlers need - `PoliteFetcher` has it; tests fake it. */
export interface SectionFetcher {
  fetchWithRevalidation(url: string, options?: { revalidate?: boolean }): Promise<RevalidationResult>;
}

/** The `.js` twin of a site path (with an optional query string). `rightNav: false` asks for the listing without the side-nav, like the farbrengen crawler does. */
export function jsTwinUrl(pathWithQuery: string, options: { rightNav?: boolean } = {}): string {
  const [path = '', query = ''] = pathWithQuery.split('?');
  const params = new URLSearchParams(query);
  if (options.rightNav === false) params.set('include_right_nav', 'false');
  const qs = params.toString();
  return `${BASE_URL}${path}.js${qs ? `?${qs}` : ''}`;
}

const TEMPLATE_CALL = /setOuterHTMLWithScripts\(\s*document\.[^,]+,\s*`([\s\S]*?)(?<!\\)`\s*\)/;

function unescapeTemplateLiteral(source: string): string {
  return source.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, escaped: string) => {
    if (escaped === 'n') return '\n';
    if (escaped === 'r') return '\r';
    if (escaped === 't') return '\t';
    if (escaped[0] === 'u') return String.fromCodePoint(parseInt(escaped.replace(/[u{}]/g, ''), 16));
    if (escaped[0] === 'x') return String.fromCharCode(parseInt(escaped.slice(1), 16));
    return escaped;
  });
}

/** The markup inside a raw response, whichever of the three shapes it has. */
export function sectionHtml(raw: string): string {
  if (/\blet html = "/.test(raw)) return extractHtmlLiteral(raw);
  const template = raw.match(TEMPLATE_CALL);
  if (template) return unescapeTemplateLiteral(template[1]!);
  return raw;
}

export function loadSection(raw: string): CheerioAPI {
  return cheerio.load(sectionHtml(raw));
}

/** Element text with whitespace collapsed, the way a reader sees it. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The last path segment of an href, verbatim - a slug like `11_nissan%20` keeps its encoded space because that is how the site addresses it. */
export function slugFromHref(href: string): string {
  const withoutQuery = href.split('?')[0]!.split('#')[0]!;
  return withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
}
