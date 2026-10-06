import { countStatus, fetchEach, fetchPage, finishIds, flag, inTransaction, knownIds, saveMembership, saveNav } from './context.js';
import type { SectionContext } from './context.js';
import { cleanText, jsTwinUrl, loadSection, slugFromHref } from './document.js';
import { hashValue, replaceRows, upsertTracked } from './tracked.js';
import type { MembershipPage, MichtavLanguage, MichtavRecord, NavEntry } from './types.js';

/**
 * Michtavim klolim (the Rebbe's general letters, for the moadim):
 * `/michtavim_klolim_new/by_moed/{slug}` lists each letter under its year
 * group (`moed_year_{Y}`) with one button per language (אידיש / לה"ק /
 * English; a disabled button means that language does not exist) and the
 * printed citations (`p.michtav-nidpas-line`: לקו"ש חי"א ע' 216);
 * `/michtavim_klolim_new/by_year/{Y}` lists them by year (membership).
 * The tochen inyanim - marked by the site as AI-written - is only a flag.
 */

export const MICHTAVIM_ENTRY = { moed: 'shevat', year: 5740 } as const;

const WRAPPER_ID = /^michtav_kloli_(\d+)(?:_y(\d+))?$/;

export function michtavimMoedPath(slug: string): string {
  return `/michtavim_klolim_new/by_moed/${slug}`;
}

export function michtavimYearPath(year: number | string): string {
  return `/michtavim_klolim_new/by_year/${year}`;
}

function navFrom(raw: string, prefix: string): NavEntry[] {
  const $ = loadSection(raw);
  const entries: NavEntry[] = [];
  $(`.side-nav a[href^="${prefix}"]`).each((_, a) => {
    entries.push({ slug: slugFromHref($(a).attr('href')!), name: cleanText($(a).text()), ord: entries.length + 1 });
  });
  return entries;
}

export function parseMichtavimMoedNav(raw: string): NavEntry[] {
  return navFrom(raw, '/michtavim_klolim_new/by_moed/');
}

export function parseMichtavimYearNav(raw: string): NavEntry[] {
  return navFrom(raw, '/michtavim_klolim_new/by_year/');
}

function language(name: string): MichtavLanguage {
  if (/אידיש/.test(name)) return 'yi';
  if (/לה["״]?ק|לשון הקודש/.test(name)) return 'he';
  if (/english/i.test(name)) return 'en';
  return 'other';
}

function edition(sub: string): string {
  if (/בלתי/.test(sub)) return 'biltiMugah';
  if (/מוגה/.test(sub)) return 'mugah';
  return sub;
}

/** The letters one page lists, in page order (a moed page, or a year page with `moedSlug` null). */
export function parseMichtavimPage(raw: string, moedSlug: string | null, pageYear: number | null): MichtavRecord[] {
  const $ = loadSection(raw);
  const records: MichtavRecord[] = [];
  $('div.michtav-wrapper').each((_, wrapper) => {
    const match = WRAPPER_ID.exec($(wrapper).attr('id') ?? '');
    if (!match) return;
    // The nearest such ancestor is the group's `moed_year_{Y}_content` div, so the pattern is anchored at the start only.
    const groupYear = /^moed_year_(\d+)/.exec($(wrapper).closest('[id^="moed_year_"]').attr('id') ?? '')?.[1];
    const year = groupYear ? Number(groupYear) : match[2] ? Number(match[2]) : pageYear;
    const links: MichtavRecord['links'] = [];
    $(wrapper)
      .find('a.michtav-lang-button[href]')
      .each((__, a) => {
        const name = cleanText($(a).find('.michtav-lang-name').text());
        const sub = cleanText($(a).find('.michtav-lang-sub').text());
        links.push({ language: language(name), edition: edition(sub), label: [name, sub].filter(Boolean).join(' - '), url: $(a).attr('href')! });
      });
    const citations: MichtavRecord['citations'] = [];
    $(wrapper)
      .find('p.michtav-nidpas-line')
      .each((__, line) => {
        const prefix = cleanText($(line).find('.michtav-nidpas-label').text()).replace(/:$/, '').trim();
        const a = $(line).find('a').first();
        const label = cleanText(a.length > 0 ? a.text() : $(line).clone().find('.michtav-nidpas-label').remove().end().text());
        citations.push({ prefix, label, url: a.attr('href') ?? null });
      });
    records.push({
      id: Number(match[1]),
      moedSlug,
      hebrewYear: year,
      ord: records.length + 1,
      heading: cleanText($(wrapper).find('.michtav-button-text').first().text()),
      links,
      citations,
      hasTochenInyanim: $(wrapper).find('button.toichen_inyonim-button').not('.farbrengen-detail-button-disabled').length > 0,
    });
  });
  return records;
}

export async function crawlMichtavim(ctx: SectionContext): Promise<void> {
  const before = knownIds(ctx.db, 'michtavim', 'id');
  const records = new Map<number, MichtavRecord>();

  const moedEntry = await fetchPage(ctx, jsTwinUrl(michtavimMoedPath(MICHTAVIM_ENTRY.moed)));
  const moadim = parseMichtavimMoedNav(moedEntry);
  for (const { item, raw } of await fetchEach(ctx, 'moadim', moadim, (m) => jsTwinUrl(michtavimMoedPath(m.slug)))) {
    for (const record of parseMichtavimPage(raw, item.slug, null)) {
      if (records.has(record.id)) ctx.result.warnings.push(`michtavim: letter ${record.id} listed under two moadim`);
      else records.set(record.id, record);
    }
  }

  const yearEntry = await fetchPage(ctx, jsTwinUrl(michtavimYearPath(MICHTAVIM_ENTRY.year)));
  const years = parseMichtavimYearNav(yearEntry);
  const yearPages: MembershipPage[] = [];
  for (const { item, raw } of await fetchEach(ctx, 'years', years, (y) => jsTwinUrl(michtavimYearPath(y.slug)))) {
    const listed = parseMichtavimPage(raw, null, Number(item.slug));
    for (const record of listed) {
      const known = records.get(record.id);
      if (!known) records.set(record.id, record);
      else if (known.hebrewYear === null) known.hebrewYear = record.hebrewYear;
    }
    yearPages.push({ slug: item.slug, itemIds: listed.map((r) => String(r.id)) });
  }

  inTransaction(ctx.db, () => {
    saveNav(ctx, 'michtavim', 'moed', moadim);
    saveNav(ctx, 'michtavim', 'year', years);
    for (const record of records.values()) {
      const has = (lang: MichtavLanguage) => flag(record.links.some((l) => l.language === lang));
      const status = upsertTracked(
        ctx.db,
        'michtavim',
        'id',
        {
          id: record.id,
          moed_slug: record.moedSlug,
          hebrew_year: record.hebrewYear,
          ord: record.ord,
          heading: record.heading,
          has_yiddish: has('yi'),
          has_hebrew: has('he'),
          has_english: has('en'),
          has_tochen_inyanim: flag(record.hasTochenInyanim),
        },
        hashValue(record),
        ctx.now,
      );
      countStatus(ctx, status);
      if (status !== 'unchanged') {
        replaceRows(
          ctx.db,
          'michtavim_links',
          { michtav_id: record.id },
          record.links.map((l) => ({ michtav_id: record.id, language: l.language, edition: l.edition, label: l.label, url: l.url })),
        );
        replaceRows(
          ctx.db,
          'michtavim_citations',
          { michtav_id: record.id },
          record.citations.map((c) => ({ michtav_id: record.id, prefix: c.prefix, label: c.label, url: c.url })),
        );
      }
    }
    for (const page of yearPages) saveMembership(ctx, 'michtavim', 'year', page);
  });
  finishIds(
    ctx,
    before,
    [...records.keys()].map(String),
  );
}
