/// <reference types="vite/client" />
import { DOC_PAGES, REPOSITORY, docAddress, type DocPage } from './pages.js';
import { renderMarkdown, type Heading } from './markdown.server.js';

/**
 * The docs' files, built into the site's server (never its script), so the
 * pages and the files can never differ: what is merged to docs/ is what
 * /developers shows after the next deploy.
 */
const FILES = import.meta.glob(['../../../../docs/developers/*.md', '../../../../docs/{api,data-model,rights,mirrors}.md'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** A file's text, by its path from the repository's root. */
export function docSource(file: string): string | null {
  const key = Object.keys(FILES).find((k) => k.replace(/^(\.\.\/)+/, '') === file);
  return key ? FILES[key]! : null;
}

/** `../c.md` as seen from `from`, from the repository's root. */
function resolve(from: string, href: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const piece of href.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.' && piece !== '') parts.push(piece);
  }
  return parts.join('/');
}

/** Where a link in a doc goes: a page of these docs, the site itself, or the file on GitHub. */
export function linkFor(from: string, href: string): string {
  if (/^(https?:|mailto:|#)/.test(href) || href.startsWith('/')) return href;
  const [path, hash] = href.split('#');
  const file = resolve(from, path!);
  const page = DOC_PAGES.find((p) => p.file === file);
  if (page) return `${docAddress(page.slug)}${hash ? `#${hash}` : ''}`;
  return `${REPOSITORY}/blob/main/${file}${hash ? `#${hash}` : ''}`;
}

/** The Copy button over each code box: shown only once the page's script can copy (DocsBehaviour). */
export const COPY = '<button type="button" class="copy" data-copy hidden lang="he"><svg class="i s" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-copy"/></svg><span>העתקה</span></button>';

const ANCHOR = (id: string) => `<a class="anchor" href="#${id}" aria-label="Link to this section"><svg class="i s" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-link"/></svg></a>`;

/** Each code box with its Copy button, and a link beside each heading. The HTML is the renderer's own, already escaped; only its shapes are matched. */
export function decorate(html: string): string {
  return html
    .replace(/<pre><code(?: data-lang="([\w-]+)")?>/g, (_, lang: string | undefined) => `<div class="codebox">${lang ? `<span class="lang">${lang}</span>` : ''}${COPY}<pre tabindex="0"><code>`)
    .replace(/<\/code><\/pre>/g, '</code></pre></div>')
    .replace(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g, (_, depth: string, id: string, inner: string) => `<h${depth} id="${id}">${inner} ${ANCHOR(id)}</h${depth}>`);
}

export interface DrawnDoc {
  page: DocPage;
  /** The file's first heading, else the page's title. */
  title: string;
  html: string;
  /** Its sections, for "On this page". */
  headings: Heading[];
}

/** One page of the docs, drawn: its words without the first heading (the page shows it as its title). */
export function drawDoc(slug: string): DrawnDoc | null {
  const page = DOC_PAGES.find((p) => p.slug === slug);
  const source = page?.file ? docSource(page.file) : null;
  if (!page || !page.file || source === null) return null;
  const drawn = renderMarkdown(source, (href) => linkFor(page.file!, href));
  const html = decorate(drawn.html.replace(/^<h1 id="[^"]*">[\s\S]*?<\/h1>\n?/, ''));
  return { page, title: drawn.title ?? page.title, html, headings: drawn.headings.filter((h) => h.depth === 2 || h.depth === 3) };
}
