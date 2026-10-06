/**
 * Recordings the catalog links through Sichos-Kodesh's media proxy (JEM's
 * audio) are played through the site itself: the site's Worker reaches the
 * proxy by a service binding (server/worker.ts), so a recording plays whatever
 * the proxy's public address is. The catalog still holds the addresses the
 * proxy had before the move (its old workers.dev name), so any of its names is
 * taken, as showcases take them (lib/showcase.ts).
 */
const MEDIA_PROXY = /^(sichos-kodesh-media-proxy\.[\w-]+\.workers\.dev|media\.sk\.chassidushub\.org)$/;

export function playable(url: string): string {
  try {
    const u = new URL(url);
    return MEDIA_PROXY.test(u.hostname) ? `/_/media${u.pathname}${u.search}` : url;
  } catch {
    return url;
  }
}
