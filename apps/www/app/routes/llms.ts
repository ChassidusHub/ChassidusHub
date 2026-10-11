import { llmsFullTxt, llmsTxt } from '../developers/llms.server';
import type { OpenApiDocument } from '../developers/reference.server';
import { fileResponse, siteOf } from '../lib/site';
import type { Route } from './+types/llms';

/** /llms.txt and /llms-full.txt (developers/llms.server.ts), for AI agents. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const site = siteOf(request).origin;
  if (!new URL(request.url).pathname.endsWith('llms-full.txt')) return fileResponse(llmsTxt(site), 'text/plain');
  const doc = (await context.api.openapi().catch(() => null)) as OpenApiDocument | null;
  return fileResponse(llmsFullTxt(site, doc), 'text/plain');
}
