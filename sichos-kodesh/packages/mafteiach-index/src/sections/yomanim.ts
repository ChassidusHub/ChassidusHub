import { countStatus, fetchEach, fetchPage, finishIds, inTransaction, knownIds, monthToken, saveNav } from './context.js';
import type { SectionContext } from './context.js';
import { cleanText, jsTwinUrl, loadSection } from './document.js';
import { hashValue, upsertTracked } from './tracked.js';
import type { NavEntry, YomanRecord } from './types.js';

/**
 * Yomanim (diaries of the Rebbe's farbrengens and days, by the chassidim
 * who kept them): `/yomanim/by_year/{Y}` lists plain Drive links under
 * month groups (`month_{token}`, the farbrengen dates' month tokens). They
 * have no ids of their own, so a yoman is keyed by its url.
 */

export const YOMANIM_ENTRY_YEAR = 5711;

export function yomanimYearPath(year: number | string): string {
  return `/yomanim/by_year/${year}`;
}

export function parseYomanimNav(raw: string): NavEntry[] {
  const $ = loadSection(raw);
  const entries: NavEntry[] = [];
  $('.side-nav button[id^="year_"]').each((_, el) => {
    const match = /\/yomanim\/by_year\/(\d+)/.exec($(el).attr('onclick') ?? '');
    if (!match) return;
    entries.push({ slug: match[1]!, name: cleanText($(el).text()), ord: entries.length + 1 });
  });
  return entries;
}

export function parseYomanimYearPage(raw: string, hebrewYear: number): YomanRecord[] {
  const $ = loadSection(raw);
  const records: YomanRecord[] = [];
  $('div.month[id^="month_"]').each((_, group) => {
    const token = monthToken(/^month_(\w+)$/.exec($(group).attr('id') ?? '')?.[1] ?? '');
    if (!token) return;
    let ord = 0;
    $(group)
      .find('a[href]')
      .each((__, a) => {
        const url = $(a).attr('href')!;
        if (!/^https?:\/\//.test(url)) return;
        ord += 1;
        records.push({ url, hebrewYear, monthToken: token, ord, label: cleanText($(a).text()) });
      });
  });
  return records;
}

export async function crawlYomanim(ctx: SectionContext): Promise<void> {
  const before = knownIds(ctx.db, 'yomanim', 'url');
  const entry = await fetchPage(ctx, jsTwinUrl(yomanimYearPath(YOMANIM_ENTRY_YEAR)));
  const years = parseYomanimNav(entry);
  const records = new Map<string, YomanRecord>();
  let duplicates = 0;
  for (const { item, raw } of await fetchEach(ctx, 'years', years, (y) => jsTwinUrl(yomanimYearPath(y.slug)))) {
    for (const record of parseYomanimYearPage(raw, Number(item.slug))) {
      if (records.has(record.url)) duplicates += 1;
      else records.set(record.url, record);
    }
  }
  inTransaction(ctx.db, () => {
    saveNav(ctx, 'yomanim', 'year', years);
    for (const record of records.values()) {
      const status = upsertTracked(
        ctx.db,
        'yomanim',
        'url',
        { url: record.url, hebrew_year: record.hebrewYear, month_token: record.monthToken, ord: record.ord, label: record.label },
        hashValue(record),
        ctx.now,
      );
      countStatus(ctx, status);
    }
  });
  if (duplicates > 0) ctx.result.warnings.push(`yomanim: ${duplicates} link(s) listed more than once; the first listing is kept`);
  finishIds(ctx, before, records.keys());
}
