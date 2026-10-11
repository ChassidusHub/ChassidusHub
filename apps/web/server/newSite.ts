/**
 * The switch-over to the new site (apps/www, the chassidushub-www Worker):
 * a request to an address in NEW_SITE_HOSTS (wrangler.toml) goes on to the
 * new site whole, through the NEW_SITE service binding, before anything
 * here runs; this Worker keeps every other address. Rolling back is that one
 * setting: empty it and chassidushub.org is this site again at the next
 * deploy (or at once, set in the dashboard). The new site sees the request
 * as it came, its address and the visitor's own (cf-connecting-ip) too.
 * Recordings played through /_/media/ stay here: the new site plays the
 * media proxy's own address, and pages already open on the old site still
 * ask this one for them.
 */
export interface NewSiteEnv {
  /** Comma-separated hostnames the new site answers, e.g. "chassidushub.org"; empty for none. */
  NEW_SITE_HOSTS?: string;
  NEW_SITE?: { fetch(request: Request): Promise<Response> };
}

export function toNewSite(request: Request, env: NewSiteEnv): boolean {
  if (!env.NEW_SITE || !env.NEW_SITE_HOSTS) return false;
  const hosts = env.NEW_SITE_HOSTS.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  const url = new URL(request.url);
  return hosts.includes(url.hostname.toLowerCase()) && !url.pathname.startsWith('/_/media/');
}
