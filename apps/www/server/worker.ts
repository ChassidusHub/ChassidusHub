import { createRequestHandler, type ServerBuild } from 'react-router';
// @ts-ignore - made by `react-router build`
import * as build from '../build/server/index.js';

/**
 * The new site on Cloudflare Workers. Built files (build/client) are answered
 * by the Workers assets binding before this runs (wrangler.toml); everything
 * else is a page, rendered here.
 */
const handler = createRequestHandler(build as unknown as ServerBuild);

export default {
  fetch(request: Request): Promise<Response> {
    return handler(request);
  },
};
