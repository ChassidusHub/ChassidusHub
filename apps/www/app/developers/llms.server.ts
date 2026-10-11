import { docSource } from './docs.server.js';
import { DOC_PAGES, docAddress } from './pages.js';
import { routeLines, type OpenApiDocument } from './reference.server.js';

const API = 'https://api.chassidushub.org';
const REPO = 'https://github.com/ChassidusHub/ChassidusHub';

/**
 * For AI agents (llmstxt.org): /llms.txt says in a page what ChassidusHub is
 * and where everything is; /llms-full.txt adds every page of the developer
 * docs, in its own Markdown, and every route of the API from its OpenAPI
 * document, to hand an agent as context. Both are made from the same files
 * and document as /developers.
 */
export function llmsTxt(site: string): string {
  const docs = DOC_PAGES.map((page) => `- [${page.title}](${site}${docAddress(page.slug)}): ${page.summary}`).join('\n');
  return `# ChassidusHub

> The open, community-edited index of Chabad Torah and media: every sefer and printing, every sicha and letter, every farbrengen and recording, with scans and texts. Everything is readable without an account through a public API, and every change is a suggestion that people review, like a pull request.

Ids (rh-7k2m9q4d) are permanent; paths (/likkutei-sichos/12/3) are readable and may move. Dates are Hebrew date keys (5742-05-10 is 10 Shevat 5742; months count from Tishrei). Names are { he, en }. Words a machine read (OCR) or heard (transcription) are marked (checked: false, machine: true) until a person checks them: say so when you quote them. Words whose rights forbid copies are listed but withheld.

## API

- [OpenAPI 3.1](${API}/openapi.json): every route
- [API reference](${site}/developers/reference): every route, with examples in curl and TypeScript
- [MCP server](${API}/mcp): Streamable HTTP. Tools to search, read items and their words, list printings, suggest fixes and items, report issues, ask a machine to read a scan or transcribe a recording, and organize the catalog. Reading needs no account; writing needs the person's account with the write scope: the server answers 401 with WWW-Authenticate so clients connect with OAuth (the person approves on ${site}/oauth/consent), or send a personal API key (Authorization: Bearer chp_…) made on ${site}/account
- [Connecting Claude, ChatGPT and other apps](${site}/connect)
- [Everything in one file](${site}/llms-full.txt)

## Docs

${docs}

## Optional

- [Download and mirror](${site}/mirrors): the whole catalog as signed dumps
- [Models](${site}/models): ChassidusHub's OCR, bold and speech models and their benchmark scores (the models are not released)
- [Health of the catalog](${site}/health) and [status](${site}/status)
- [About ChassidusHub](${site}/about)
- [Source code](${REPO}) (AGPL-3.0)
`;
}

/** Every doc page's own Markdown, each headed by where it is read, then every route. */
export function llmsFullTxt(site: string, doc: OpenApiDocument | null): string {
  const parts = [llmsTxt(site)];
  for (const page of DOC_PAGES) {
    const source = page.file ? docSource(page.file) : null;
    if (source) parts.push(`\n---\n\n<!-- ${site}${docAddress(page.slug)} (${page.file}) -->\n\n${source.trim()}\n`);
  }
  if (doc?.paths) parts.push(`\n---\n\n# Every route (${doc.info?.title ?? 'ChassidusHub API'} ${doc.info?.version ?? ''}, ${API})\n\n${routeLines(doc).join('\n')}\n`);
  return parts.join('');
}
