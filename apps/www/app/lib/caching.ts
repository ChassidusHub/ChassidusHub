/**
 * How long Cloudflare's edge keeps a page (server/edge.ts). Browsers always
 * ask again (max-age=0), since a browser cannot be told a page changed; the
 * edge can, and answers them at once.
 */

/**
 * A page drawn from the catalog alone: the same for everyone, and changed
 * only when a Suggestion about something it shows is approved, which makes
 * the edge forget it (server/edge.ts, `forget`). So it is kept for a week,
 * and then shown for a day more while it is drawn again behind it.
 */
export const KEPT_PAGE = 'public, max-age=0, s-maxage=604800, stale-while-revalidate=86400';

/**
 * A page drawn on the server from the catalog snapshot (the Listen year page,
 * #321): the snapshot is built again a moment after a change, so a page drawn
 * just after the edge forgot it may show the catalog as it was. It is kept
 * ten minutes only, so it is never more than that behind.
 */
export const SNAPSHOT_PAGE = 'public, max-age=0, s-maxage=600, stale-while-revalidate=60';

/**
 * A page that also shows what fits the coming days (Home, Listen): kept as
 * a catalog page is, but only until the day turns, at midnight UTC as
 * `today` counts days (app/listen/data.server.ts), and an hour at most, so
 * the days it shows are never more than an hour behind.
 */
export function todaysPage(now = new Date()): string {
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const seconds = Math.max(60, Math.min(3600, Math.floor((tomorrow - now.getTime()) / 1000)));
  return `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=60`;
}
