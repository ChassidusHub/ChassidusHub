import { parseListingPage } from '../parseListing.js';
import { countStatus, fetchEach, fetchPage, inTransaction, saveMembership, saveNav } from './context.js';
import type { SectionContext } from './context.js';
import { cleanText, jsTwinUrl, loadSection, slugFromHref } from './document.js';
import type { MembershipPage, NavEntry } from './types.js';

/**
 * mafteiach's own grouping of the farbrengens it already lists by date:
 * `/all/moadim/{slug}` (101 moadim and yemei d'pagra - every Yom Tov and
 * erev, Rosh Chodesh, Yud Shevat, rallies, yechidus days, Kinus Hashluchim,
 * ...) and `/all/parshiyos/{slug}` (53 parshiyos). Membership is curated by
 * the site, not derived from the date - כ"ב שבט includes other dates the
 * same yahrzeit was marked on - which is why it is read here instead of
 * computed. Each page lists `div.farbrengen` items, so the farbrengen
 * listing parser reads the occasion ids unchanged.
 *
 * Slugs are kept exactly as the side-nav links them, including the
 * trailing `%20` two of them carry (`22_shevat%20`, `11_nissan%20`).
 */

export type AllGrouping = 'moadim' | 'parshiyos';

export const ALL_GROUPING_ENTRY: Record<AllGrouping, string> = { moadim: 'rosh_hashanah', parshiyos: 'bereshit' };
const KIND: Record<AllGrouping, string> = { moadim: 'moad', parshiyos: 'parsha' };

export function allGroupingPath(grouping: AllGrouping, slug: string): string {
  return `/all/${grouping}/${slug}`;
}

/** The right-hand tabs (`a#right_nav_tab_{n}`) naming every moed or parsha, in the site's order. */
export function parseAllGroupingNav(raw: string, grouping: AllGrouping): NavEntry[] {
  const $ = loadSection(raw);
  const prefix = `/all/${grouping}/`;
  const entries: NavEntry[] = [];
  $('a[id^="right_nav_tab_"]').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    if (!href.startsWith(prefix)) return;
    entries.push({ slug: slugFromHref(href), name: cleanText($(a).text()), ord: entries.length + 1 });
  });
  return entries;
}

/** The farbrengen occasion ids one moed or parsha page lists, in page order. */
export function parseAllGroupingPage(raw: string): string[] {
  return parseListingPage(raw).map((entry) => String(entry.id));
}

export async function crawlAllGrouping(ctx: SectionContext, grouping: AllGrouping): Promise<void> {
  const kind = KIND[grouping];
  const entry = await fetchPage(ctx, jsTwinUrl(allGroupingPath(grouping, ALL_GROUPING_ENTRY[grouping])));
  const nav = parseAllGroupingNav(entry, grouping);
  const pages: MembershipPage[] = (await fetchEach(ctx, grouping, nav, (n) => jsTwinUrl(allGroupingPath(grouping, n.slug), { rightNav: false }))).map(({ item, raw }) => ({
    slug: item.slug,
    itemIds: parseAllGroupingPage(raw),
  }));

  const occasionIds = new Set((ctx.db.prepare('SELECT id FROM occasions').all() as Array<{ id: number }>).map((row) => String(row.id)));
  let unknown = 0;
  inTransaction(ctx.db, () => {
    saveNav(ctx, grouping, kind, nav);
    for (const page of pages) {
      if (page.itemIds.length === 0) ctx.result.warnings.push(`${grouping}: ${page.slug} listed no farbrengens`);
      unknown += page.itemIds.filter((id) => !occasionIds.has(id)).length;
      countStatus(ctx, saveMembership(ctx, grouping, kind, page));
    }
  });
  if (unknown > 0) ctx.result.warnings.push(`${grouping}: ${unknown} listed farbrengen(s) are not in occasions yet - run the farbrengen sync first`);
  ctx.result.newIds = [];
  ctx.result.missingIds = [];
}
