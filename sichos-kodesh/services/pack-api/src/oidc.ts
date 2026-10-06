/**
 * GitHub Actions' OpenID Connect tokens: who may put a release on the
 * app server. The release workflow asks GitHub for a short-lived token
 * (`permissions: id-token: write`) and sends it along; the Worker checks
 * GitHub's signature on it and that it names this repository, the release
 * workflow and a release ref. No shared secret is stored anywhere - not
 * in the repository's secrets, not in the Worker.
 */

export interface OidcPolicy {
  issuer: string;
  /** The audience the workflow asks for, so a token minted for anything else is refused. */
  audience: string;
  /** owner/name, compared without case (GitHub's own rule). */
  repository: string;
  /** The workflow file that may publish, e.g. `.github/workflows/android-release-apk.yml`. */
  workflowPath: string;
  /** The refs it may publish from: a version tag, or main (a run started by hand). */
  refs: RegExp;
}

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';

export const APP_RELEASE_POLICY: OidcPolicy = {
  issuer: GITHUB_ISSUER,
  audience: 'sichos-kodesh-app-release',
  repository: 'shmuky/Sichos-Kodesh',
  workflowPath: '.github/workflows/android-release-apk.yml',
  refs: /^refs\/(tags\/v\d+\.\d+\.\d+|heads\/main)$/,
};

export interface GithubClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  repository: string;
  ref: string;
  workflow_ref: string;
  [claim: string]: unknown;
}

export interface Jwk {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
}

/** GitHub's signing keys; fetched fresh when a token names a key not seen yet. */
export type JwksSource = (refresh: boolean) => Promise<Jwk[]>;

export class TokenError extends Error {}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlBytes(value))) as Record<string, unknown>;
  } catch {
    throw new TokenError('the token is not a JWT');
  }
}

async function findKey(kid: string, jwks: JwksSource): Promise<Jwk> {
  for (const refresh of [false, true]) {
    const key = (await jwks(refresh)).find((k) => k.kid === kid);
    if (key) return key;
  }
  throw new TokenError(`GitHub has no signing key ${kid}`);
}

/** The token's claims when GitHub signed it for `policy`; throws TokenError otherwise. */
export async function verifyGithubToken(token: string, policy: OidcPolicy, jwks: JwksSource, now: Date = new Date()): Promise<GithubClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new TokenError('the token is not a JWT');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = base64UrlJson(headerPart);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new TokenError('the token is not signed with RS256');
  const jwk = await findKey(header.kid, jwks);
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlBytes(signaturePart), signed);
  if (!valid) throw new TokenError('the token signature is wrong');

  const claims = base64UrlJson(payloadPart) as unknown as GithubClaims;
  const seconds = Math.floor(now.getTime() / 1000);
  const leeway = 60;
  if (claims.iss !== policy.issuer) throw new TokenError('the token is not from GitHub Actions');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(policy.audience)) throw new TokenError(`the token is not for ${policy.audience}`);
  if (typeof claims.exp !== 'number' || claims.exp + leeway < seconds) throw new TokenError('the token has expired');
  if (typeof claims.nbf === 'number' && claims.nbf - leeway > seconds) throw new TokenError('the token is not valid yet');
  if (typeof claims.repository !== 'string' || claims.repository.toLowerCase() !== policy.repository.toLowerCase()) throw new TokenError('the token is for another repository');
  if (typeof claims.ref !== 'string' || !policy.refs.test(claims.ref)) throw new TokenError(`releases are published from a version tag or main, not ${String(claims.ref)}`);
  const workflow = `${policy.repository}/${policy.workflowPath}@`.toLowerCase();
  if (typeof claims.workflow_ref !== 'string' || !claims.workflow_ref.toLowerCase().startsWith(workflow)) throw new TokenError('the token is not from the release workflow');
  return claims;
}

/** GitHub's published keys, kept for an hour. */
export function githubJwks(fetchFn: typeof fetch = fetch): JwksSource {
  let cached: { keys: Jwk[]; at: number } | null = null;
  return async (refresh) => {
    if (cached && !refresh && Date.now() - cached.at < 3600_000) return cached.keys;
    const response = await fetchFn(`${GITHUB_ISSUER}/.well-known/jwks`);
    if (!response.ok) throw new TokenError(`GitHub's keys: HTTP ${response.status}`);
    const body = (await response.json()) as { keys?: Jwk[] };
    cached = { keys: body.keys ?? [], at: Date.now() };
    return cached.keys;
  };
}
