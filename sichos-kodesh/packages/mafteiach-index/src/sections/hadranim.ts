import { countStatus, fetchEach, fetchPage, finishIds, flag, inTransaction, knownIds, saveMembership, saveNav } from './context.js';
import type { SectionContext } from './context.js';
import { cleanText, jsTwinUrl, loadSection, slugFromHref } from './document.js';
import { hashValue, replaceRows, upsertTracked } from './tracked.js';
import type { HadranRecord, MembershipPage, NavEntry } from './types.js';

/**
 * Hadranim (the Rebbe's siyum talks on a masechta): `/hadranim/by_masechta/{slug}`
 * lists each hadran with its links inline (בלתי מוגה, מוגה) and the
 * farbrengens it was said at ("ראה התוועדות" -> /all/{date});
 * `/hadranim/by_year/{Y}` lists the same hadranim by year (membership,
 * ids `hadran_{id}_y{year}`). The "toichen" box is only a flag.
 */

export const HADRANIM_ENTRY = { masechta: 'berachos', year: 5736 } as const;

const WRAPPER_ID = /^hadran_(\d+)(?:_y(\d+))?$/;
const ALL_DATE_HREF = /^\/all\/(\d{4}-\d{2}[AB]?-\d{2}[a-z]?)$/;

export function masechtaPath(slug: string): string {
  return `/hadranim/by_masechta/${slug}`;
}

export function hadranimYearPath(year: number | string): string {
  return `/hadranim/by_year/${year}`;
}

export function parseMasechtaNav(raw: string): NavEntry[] {
  const $ = loadSection(raw);
  const entries: NavEntry[] = [];
  $('.side-nav a[href^="/hadranim/by_masechta/"]').each((_, a) => {
    entries.push({ slug: slugFromHref($(a).attr('href')!), name: cleanText($(a).text()), ord: entries.length + 1 });
  });
  return entries;
}

export function parseHadranimYearNav(raw: string): NavEntry[] {
  const $ = loadSection(raw);
  const entries: NavEntry[] = [];
  $('.side-nav a[href^="/hadranim/by_year/"]').each((_, a) => {
    entries.push({ slug: slugFromHref($(a).attr('href')!), name: cleanText($(a).text()), ord: entries.length + 1 });
  });
  return entries;
}

/** The hadranim one page lists, in page order (a masechta page, or a year page with `masechtaSlug` null). */
export function parseHadranimPage(raw: string, masechtaSlug: string | null): HadranRecord[] {
  const $ = loadSection(raw);
  const records: HadranRecord[] = [];
  $('div.hadran-wrapper').each((_, wrapper) => {
    const match = WRAPPER_ID.exec($(wrapper).attr('id') ?? '');
    if (!match) return;
    const links: HadranRecord['links'] = [];
    $(wrapper)
      .find('.hadran_bilti_muga-content a[href]')
      .each((__, a) => {
        links.push({ section: 'biltiMugah', label: cleanText($(a).text()), url: $(a).attr('href')! });
      });
    $(wrapper)
      .find('.hadran_muga-content a[href]')
      .each((__, a) => {
        links.push({ section: 'mugah', label: cleanText($(a).text()), url: $(a).attr('href')! });
      });
    const hebrewDates: string[] = [];
    $(wrapper)
      .find('.reeh-hisvaadus-content a[href]')
      .each((__, a) => {
        const date = ALL_DATE_HREF.exec($(a).attr('href') ?? '')?.[1];
        if (date && !hebrewDates.includes(date)) hebrewDates.push(date);
      });
    records.push({
      id: Number(match[1]),
      masechtaSlug,
      ord: records.length + 1,
      label: cleanText($(wrapper).find('.hadran-button-text .thick-font').first().text()),
      dateLines: $(wrapper)
        .find('.hadran-dates-expanded > div')
        .map((__, d) => cleanText($(d).text()))
        .get()
        .filter(Boolean),
      links,
      hebrewDates,
      hasToichen: cleanText($(wrapper).find('.hadran-toichen-box').text()).length > 0,
    });
  });
  return records;
}

export async function crawlHadranim(ctx: SectionContext): Promise<void> {
  const before = knownIds(ctx.db, 'hadranim', 'id');
  const records = new Map<number, HadranRecord>();

  const masechtaEntry = await fetchPage(ctx, jsTwinUrl(masechtaPath(HADRANIM_ENTRY.masechta)));
  const masechtos = parseMasechtaNav(masechtaEntry);
  // One siyum can close several masechtos, so a hadran can be listed on
  // several masechta pages: it keeps the first as `masechta_slug` and every
  // page it is on becomes a membership, like the years.
  const masechtaPages: MembershipPage[] = [];
  for (const { item, raw } of await fetchEach(ctx, 'masechtos', masechtos, (m) => jsTwinUrl(masechtaPath(m.slug)))) {
    const listed = parseHadranimPage(raw, item.slug);
    for (const record of listed) if (!records.has(record.id)) records.set(record.id, record);
    masechtaPages.push({ slug: item.slug, itemIds: listed.map((r) => String(r.id)) });
  }

  const yearEntry = await fetchPage(ctx, jsTwinUrl(hadranimYearPath(HADRANIM_ENTRY.year)));
  const years = parseHadranimYearNav(yearEntry);
  const yearPages: MembershipPage[] = [];
  for (const { item, raw } of await fetchEach(ctx, 'years', years, (y) => jsTwinUrl(hadranimYearPath(y.slug)))) {
    const listed = parseHadranimPage(raw, null);
    for (const record of listed) if (!records.has(record.id)) records.set(record.id, record);
    yearPages.push({ slug: item.slug, itemIds: listed.map((r) => String(r.id)) });
  }

  inTransaction(ctx.db, () => {
    saveNav(ctx, 'hadranim', 'masechta', masechtos);
    saveNav(ctx, 'hadranim', 'year', years);
    for (const record of records.values()) {
      const status = upsertTracked(
        ctx.db,
        'hadranim',
        'id',
        {
          id: record.id,
          masechta_slug: record.masechtaSlug,
          ord: record.ord,
          label: record.label,
          date_lines: record.dateLines.join('; '),
          has_bilti_mugah: flag(record.links.some((l) => l.section === 'biltiMugah')),
          has_mugah: flag(record.links.some((l) => l.section === 'mugah')),
          has_toichen: flag(record.hasToichen),
        },
        hashValue(record),
        ctx.now,
      );
      countStatus(ctx, status);
      if (status !== 'unchanged') {
        replaceRows(
          ctx.db,
          'hadranim_links',
          { hadran_id: record.id },
          record.links.map((l) => ({ hadran_id: record.id, section: l.section, label: l.label, url: l.url })),
        );
        replaceRows(
          ctx.db,
          'hadran_occasions',
          { hadran_id: record.id },
          record.hebrewDates.map((date, index) => ({ hadran_id: record.id, hebrew_date: date, ord: index + 1 })),
        );
      }
    }
    for (const page of masechtaPages) saveMembership(ctx, 'hadranim', 'masechta', page);
    for (const page of yearPages) saveMembership(ctx, 'hadranim', 'year', page);
  });
  finishIds(
    ctx,
    before,
    [...records.keys()].map(String),
  );
}
