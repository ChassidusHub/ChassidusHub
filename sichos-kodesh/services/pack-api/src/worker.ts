import type { PackKeyPair } from '@sichos-kodesh/pack-format';
import type { AppBucket } from './appRelease.js';
import { createAppReleaseHandler } from './appRelease.js';
import { createHandler } from './handler.js';
import { APP_RELEASE_POLICY, githubJwks, verifyGithubToken } from './oidc.js';
import type { R2BucketLike } from './r2.js';
import { r2Store } from './r2.js';

/**
 * The Cloudflare Worker. Bindings (wrangler.toml): ARCHIVE, the R2 bucket
 * the published archive is synced to (and where the phone app's releases
 * live, appRelease.ts); PACK_SIGNING_KEY, a secret holding the JSON of
 * the signing key file; CORS_ORIGIN, the download site.
 */
interface Env {
  ARCHIVE: R2BucketLike & AppBucket;
  PACK_SIGNING_KEY?: string;
  CORS_ORIGIN?: string;
}

let key: PackKeyPair | null | undefined;

function signingKey(env: Env): PackKeyPair | null {
  if (key === undefined) key = env.PACK_SIGNING_KEY ? (JSON.parse(env.PACK_SIGNING_KEY) as PackKeyPair) : null;
  return key;
}

const jwks = githubJwks();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = await createAppReleaseHandler(env.ARCHIVE, { verify: (token) => verifyGithubToken(token, APP_RELEASE_POLICY, jwks) })(request);
    if (app) {
      app.headers.set('Access-Control-Allow-Origin', '*');
      app.headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, Content-Range, ETag');
      return app;
    }
    return createHandler(r2Store(env.ARCHIVE), { signingKey: signingKey(env), corsOrigin: env.CORS_ORIGIN ?? '*' })(request);
  },
};
