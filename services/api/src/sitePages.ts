import type { Catalog } from '@chassidushub/core';

/**
 * The new site keeps its pages at Cloudflare's edge for days, each tagged
 * with the items it shows (apps/www/server/edge.ts). Once a minute
 * (wrangler.toml, [triggers]) the API tells it which items the merges since
 * last time changed, and the site forgets every page about one of them, so
 * the next reader gets the page as it now is.
 *
 * A page is about an item when the item's id is anywhere in what the API
 * answered while the page was drawn: its own page, its parent's list, the
 * path bars below it. So forgetting the changed items, and what they point
 * at (the sefer a new sicha joins, the shelf a sefer moved to), covers
 * every page that shows the change.
 */

/** The site's `CachedPage` entrypoint, through a service binding (wrangler.toml). */
export interface SitePages {
  forget(ids: string[]): Promise<{ ok: boolean; purges: number; errors: string[] }>;
  /** Draws a page as a reader's first visit would (warmTodaysPages). */
  fetch?(request: Request): Promise<Response>;
}

/**
 * Home and Listen are kept only until UTC midnight (apps/www app/lib/caching.ts, `todaysPage`): they show the coming
 * days' farbrengens. Their first reader of the day paid for a read of every event's date, 0.55 s from a cold
 * database (#314). So at a minute past midnight the API draws them itself, as that reader would, and the reader
 * after finds the database warm.
 */
export const TODAYS_PAGES = ['/', '/listen'];
export const SITE_ORIGIN = 'https://new.chassidushub.org';

/** At 00:01 UTC, draws today's pages; any other minute, nothing. Answers how many were drawn. */
export async function warmTodaysPages(site: Pick<SitePages, 'fetch'>, now: Date, origin = SITE_ORIGIN): Promise<number> {
  if (!site.fetch || now.getUTCHours() !== 0 || now.getUTCMinutes() !== 1) return 0;
  const drawn = await Promise.all(
    TODAYS_PAGES.map((path) => site.fetch!(new Request(`${origin}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChassidusHub page warmer)' } })).then((page) => (page.body?.cancel(), page.ok))),
  );
  return drawn.filter(Boolean).length;
}

/** Where the last merge whose pages were forgotten is kept (summaries/site-pages.json in the public bucket, r2.ts keptStore). */
export interface Kept {
  get<T>(name: string): Promise<T | null>;
  put(name: string, value: unknown): Promise<void>;
}

const KEPT_AS = 'site-pages';

/**
 * Hyperdrive keeps a read's answer for up to a minute, and serves it for 15
 * seconds more while it asks again. A page drawn sooner after a merge could
 * be drawn from the answer before it and kept for days, so a merge's pages
 * are forgotten only once it is this old.
 */
export const SETTLE_SECONDS = 90;

/** Past this many items at once (an import), the site forgets every page instead (edge.ts, `forget`). */
export const MOST_ITEMS = 2000;

/**
 * Forgets the site's pages about what merged since the last run. The first
 * run only notes where main is: the site's pages were all drawn after it.
 * A run whose forgetting fails leaves the mark where it was, so the next
 * run tries those merges again.
 */
export async function forgetChangedPages(catalog: Catalog, kept: Kept, site: SitePages): Promise<{ through: number; items: number }> {
  const mark = await kept.get<{ seq: number }>(KEPT_AS);
  if (!mark) {
    const { rows } = await catalog.db.query<{ seq: string | number }>('SELECT coalesce(max(seq), 0) AS seq FROM commit');
    const through = Number(rows[0]?.seq ?? 0);
    await kept.put(KEPT_AS, { seq: through });
    return { through, items: 0 };
  }
  const { rows: commits } = await catalog.db.query<{ seq: string | number; settled: boolean }>(
    `SELECT seq, at < now() - make_interval(secs => $2) AS settled FROM commit WHERE seq > $1 ORDER BY seq LIMIT 1000`,
    [mark.seq, SETTLE_SECONDS],
  );
  // Merges in order, up to the first that is too new: a later one waits with it.
  const settled: number[] = [];
  for (const c of commits) {
    if (!c.settled) break;
    settled.push(Number(c.seq));
  }
  if (settled.length === 0) return { through: mark.seq, items: 0 };
  const from = settled[0]!;
  const through = settled.at(-1)!;
  const { rows: changed } = await catalog.db.query<{ id: string }>(
    'SELECT DISTINCT entity_id AS id FROM commit_change WHERE commit_seq BETWEEN $1 AND $2 LIMIT $3',
    [from, through, MOST_ITEMS + 1],
  );
  const ids = new Set(changed.map((r) => r.id));
  if (ids.size > 0 && ids.size <= MOST_ITEMS) {
    const { rows: pointed } = await catalog.db.query<{ id: string }>('SELECT DISTINCT to_id AS id FROM entity_ref WHERE from_id = ANY($1::text[]) LIMIT $2', [[...ids], MOST_ITEMS + 1]);
    for (const r of pointed) ids.add(r.id);
  }
  if (ids.size > 0) {
    const answer = await site.forget([...ids].slice(0, MOST_ITEMS + 1));
    if (!answer.ok) throw new Error(`the site did not forget its pages: ${answer.errors.join('; ')}`);
  }
  await kept.put(KEPT_AS, { seq: through });
  return { through, items: ids.size };
}
