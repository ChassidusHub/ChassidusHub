import { fileResponse, siteOf } from '../lib/site';
import type { Route } from './+types/llms';

const API = 'https://api.chassidushub.org';
const REPO = 'https://github.com/ChassidusHub/ChassidusHub';

/**
 * For AI agents (llmstxt.org): /llms.txt says in a page what ChassidusHub is
 * and where everything is; /llms-full.txt adds every route of the API, from
 * its OpenAPI document, to hand an agent as context.
 */
export function llmsTxt(site: string): string {
  return `# ChassidusHub

> The open, community-edited index of Chabad Torah and media: every sefer and printing, every sicha and letter, every farbrengen and recording, with scans and texts. Everything is readable without an account through a public API, and every change is a suggestion that people review, like a pull request.

Ids (rh-7k2m9q4d) are permanent; paths (/likkutei-sichos/12/3) are readable and may move. Dates are Hebrew date keys (5742-05-10 is 10 Shevat 5742; months count from Tishrei). Names are { he, en }. Words a machine read (OCR) or heard (transcription) are marked (checked: false, machine: true) until a person checks them: say so when you quote them. Words whose rights forbid copies are listed but withheld.

## API

- [OpenAPI 3.1](${API}/openapi.json): every route
- [MCP server](${API}/mcp): Streamable HTTP. Tools to search, read items and their words, list printings, suggest fixes and items, report issues, ask a machine to read a scan or transcribe a recording, and organize the catalog. Reading needs no account; writing needs the person's account with the write scope: the server answers 401 with WWW-Authenticate so clients connect with OAuth (the person approves on ${site}/oauth/consent), or send a personal API key (Authorization: Bearer chp_…) made on ${site}/account
- [Connecting Claude, ChatGPT and other apps](${site}/connect)
- [Everything in one file](${site}/llms-full.txt)

## Docs

- [Developer docs](${REPO}/tree/main/docs/developers)
- [About ChassidusHub](${site}/about)

## Optional

- [Source code](${REPO}) (AGPL-3.0)
`;
}

type OpenApi = { info?: { title?: string; version?: string }; paths?: Record<string, Record<string, { summary?: string; operationId?: string }>> };

export function routesOf(doc: OpenApi): string[] {
  return Object.entries(doc.paths ?? {}).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
      .map(([method, op]) => `- \`${method.toUpperCase()} ${path}\`${op.operationId ? ` ${op.operationId}` : ''}${op.summary ? `: ${op.summary}` : ''}`),
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const site = siteOf(request).origin;
  if (!new URL(request.url).pathname.endsWith('llms-full.txt')) return fileResponse(llmsTxt(site), 'text/plain');
  const doc = (await context.api.openapi().catch(() => null)) as OpenApi | null;
  const routes = doc ? `\n---\n\n# Every route (${doc.info?.title ?? 'ChassidusHub API'} ${doc.info?.version ?? ''}, ${API})\n\n${routesOf(doc).join('\n')}\n` : '';
  return fileResponse(llmsTxt(site) + routes, 'text/plain');
}
