import type { PackKeyPair } from '@sichos-kodesh/pack-format';
import { createHandler } from './handler.js';
import type { R2BucketLike } from './r2.js';
import { r2Store } from './r2.js';

/**
 * The Cloudflare Worker. Bindings (wrangler.toml): ARCHIVE, the R2 bucket
 * the published archive is synced to; PACK_SIGNING_KEY, a secret holding
 * the JSON of the signing key file; CORS_ORIGIN, the download site.
 */
interface Env {
  ARCHIVE: R2BucketLike;
  PACK_SIGNING_KEY?: string;
  CORS_ORIGIN?: string;
}

let key: PackKeyPair | null | undefined;

function signingKey(env: Env): PackKeyPair | null {
  if (key === undefined) key = env.PACK_SIGNING_KEY ? (JSON.parse(env.PACK_SIGNING_KEY) as PackKeyPair) : null;
  return key;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return createHandler(r2Store(env.ARCHIVE), { signingKey: signingKey(env), corsOrigin: env.CORS_ORIGIN ?? '*' })(request);
  },
};
