import { createHash } from 'node:crypto';

/**
 * While ChassidusHub is private (services/api/src/lock.ts), the jobs' own
 * reads of chassidushub.org and api.chassidushub.org (scans, recordings, page
 * fixes, mirrors, and recordings through the site) carry the lock's key. It is made from the password in
 * CHASSIDUSHUB_PASSWORD (a repository secret); without it they go as anyone,
 * and are turned away.
 */
const password = process.env.CHASSIDUSHUB_PASSWORD?.trim();
if (password) {
  const key = createHash('sha256').update(`chassidushub-lock:${password}`).digest('hex');
  const ours = (url: URL) => url.protocol === 'https:' && (url.hostname === 'chassidushub.org' || url.hostname.endsWith('.chassidushub.org'));
  const plain = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    let url = new URL(input instanceof Request ? input.url : String(input));
    // Sichos-Kodesh's media proxy (JEM's audio) has no public address while private: the site passes it on.
    if (url.hostname === 'sichos-kodesh-media-proxy.chassidushub-org.workers.dev') {
      url = new URL(`https://chassidushub.org/_/media${url.pathname}${url.search}`);
      input = url.toString();
    }
    if (!ours(url)) return plain(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('x-chassidushub-key', key);
    return plain(input, { ...init, headers });
  };
}
