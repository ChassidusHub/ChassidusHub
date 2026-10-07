import type { Route } from './+types/drafts-pass';
import { siteOf } from '../lib/context.server.js';
import { passThrough } from '../lib/pass.server.js';

/** Your changes not sent yet (lib/draft.ts): /_/drafts/* to the API's /v1/drafts/*. Only these addresses pass. */
const ALLOWED = /^(rh-[0-9a-z]{8}(\/send)?)?$/;

async function pass({ request, params, context }: Route.LoaderArgs | Route.ActionArgs) {
  const path = params['*'] ?? '';
  if (!ALLOWED.test(path)) return new Response('Not found', { status: 404 });
  return passThrough(siteOf(context).api, request, `/v1/drafts${path ? `/${path}` : ''}`);
}

export const loader = pass;
export const action = pass;
