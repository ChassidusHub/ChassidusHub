import { countStatus, fetchEach, fetchPage, finishIds, inTransaction, knownIds, saveMembership, saveNav } from './context.js';
import type { SectionContext } from './context.js';
import { cleanText, jsTwinUrl, loadSection } from './document.js';
import { hashValue, replaceRows, upsertTracked } from './tracked.js';
import type { LikkutSichaLinkRole, LikkutSichaRecord, MembershipPage, NavEntry } from './types.js';

/**
 * Likkutei Sichos: `/likkutei_sichos/by_volume/{n}` lists every sicha of a
 * volume under its parsha/moed sections; `/by_parsha/{slug}` and
 * `/by_moad/{slug}` list the same sichos regrouped, so those two views are
 * read as membership only. A sicha is keyed by the volume and start page
 * its element id carries (`likkut_sicha_{vol}_{page}`) - stable across all
 * three views, and present even when there is no kitzur (whose numeric id
 * is the only other id the site exposes). The printed label can differ by
 * a page from the id; it is stored as printed.
 *
 * Only facts, flags and links: the teaser under each sicha and the kitzur
 * pages are mafteiach's own writing and are never read.
 */

export type LsNavKind = 'volume' | 'parsha' | 'moad';

export const LS_ENTRY = { parsha: 'bereshit', moad: 'rosh_hashanah' } as const;

const SICHA_BUTTON_ID = /^likkut_sicha_(\d+)_(\d+)__button$/;
const KITZUR_HREF = /\/likkutei_sichos\/(\d+)\/kitzur/;

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];

/** A volume number as the menu writes it (39 -> לט, 15 -> טו); 1-99. */
export function hebrewNumeral(n: number): string {
  if (n === 15) return 'טו';
  if (n === 16) return 'טז';
  return `${TENS[Math.floor(n / 10) % 10] ?? ''}${ONES[n % 10] ?? ''}`;
}

export function lsVolumePath(volume: number | string): string {
  return `/likkutei_sichos/by_volume/${volume}`;
}

export function lsGroupedPath(kind: 'parsha' | 'moad', slug: string): string {
  return `/likkutei_sichos/by_${kind}/${slug}`;
}

/** The side-nav of an LS page. Its buttons navigate by `onclick`; the slug is taken from that target. */
export function parseLsNav(raw: string, kind: LsNavKind): NavEntry[] {
  const $ = loadSection(raw);
  const pattern = new RegExp(`/likkutei_sichos/by_${kind}/([^'"?#\\s]+)`);
  const entries: NavEntry[] = [];
  $(`.side-nav button[id^="${kind}_"]`).each((_, el) => {
    const match = ($(el).attr('onclick') ?? '').match(pattern);
    if (!match) return;
    entries.push({ slug: match[1]!, name: cleanText($(el).text()), ord: entries.length + 1 });
  });
  return entries;
}

function linkRole(label: string): LikkutSichaLinkRole {
  if (label === 'שיחה') return 'sicha';
  if (label === 'מתורגם') return 'translated';
  if (label === 'קיצור') return 'kitzur';
  return 'other';
}

/** Every sicha of one `by_volume` page, in page order. */
export function parseLsVolumePage(raw: string): LikkutSichaRecord[] {
  const $ = loadSection(raw);
  const records: LikkutSichaRecord[] = [];
  $('div.parsha').each((_, section) => {
    const seq = Number(/^parsha_(\d+)$/.exec($(section).attr('id') ?? '')?.[1] ?? 0);
    const heading = $(section).children('button').first().clone();
    heading.find('span').remove();
    const sectionLabel = cleanText(heading.text());
    $(section)
      .find('button.likkut-sicha-button')
      .each((__, button) => {
        const match = SICHA_BUTTON_ID.exec($(button).attr('id') ?? '');
        if (!match) return;
        const volume = Number(match[1]);
        const page = Number(match[2]);
        const content = $(`#likkut_sicha_${volume}_${page}__content`);
        const links: LikkutSichaRecord['links'] = [];
        let kitzurId: number | null = null;
        content.find('.button-row a[href]').each((___, a) => {
          const label = cleanText($(a).text());
          const url = $(a).attr('href')!;
          const kitzur = KITZUR_HREF.exec(url);
          if (kitzur) kitzurId = Number(kitzur[1]);
          links.push({ role: linkRole(label), label, url });
        });
        records.push({ id: `${volume}:${page}`, volume, page, label: cleanText($(button).text()), sectionSeq: seq, sectionLabel, ord: records.length + 1, kitzurId, links });
      });
  });
  return records;
}

/** The sicha ids a `by_parsha`/`by_moad` page lists, in page order. */
export function parseLsGroupedPage(raw: string): string[] {
  const $ = loadSection(raw);
  const ids: string[] = [];
  $('button.likkut-sicha-button').each((_, button) => {
    const match = SICHA_BUTTON_ID.exec($(button).attr('id') ?? '');
    if (match) ids.push(`${Number(match[1])}:${Number(match[2])}`);
  });
  return ids;
}

export async function crawlLikkuteiSichos(ctx: SectionContext): Promise<void> {
  const before = knownIds(ctx.db, 'ls_sichos', 'id');

  const volumeEntry = await fetchPage(ctx, jsTwinUrl(lsVolumePath(1)));
  const volumes = parseLsNav(volumeEntry, 'volume');
  const records = new Map<string, LikkutSichaRecord>();
  const addSichos = (parsed: LikkutSichaRecord[]): void => {
    for (const record of parsed) {
      if (records.has(record.id)) ctx.result.warnings.push(`likkuteiSichos: sicha ${record.id} listed twice`);
      else records.set(record.id, record);
    }
  };
  for (const { item, raw } of await fetchEach(ctx, 'volumes', volumes, (v) => jsTwinUrl(lsVolumePath(v.slug)))) {
    const parsed = parseLsVolumePage(raw);
    if (parsed.length === 0) ctx.result.warnings.push(`likkuteiSichos: volume ${item.slug} listed no sichos`);
    addSichos(parsed);
  }

  const grouped: Array<{ kind: 'parsha' | 'moad'; nav: NavEntry[]; pages: MembershipPage[] }> = [];
  for (const kind of ['parsha', 'moad'] as const) {
    const entry = await fetchPage(ctx, jsTwinUrl(lsGroupedPath(kind, LS_ENTRY[kind])));
    const nav = parseLsNav(entry, kind);
    const pages = (await fetchEach(ctx, `by_${kind}`, nav, (n) => jsTwinUrl(lsGroupedPath(kind, n.slug)))).map(({ item, raw }) => ({ slug: item.slug, itemIds: parseLsGroupedPage(raw) }));
    grouped.push({ kind, nav, pages });
  }

  // The volume menu stops at 39, but the parsha/moad pages also list the
  // sichos of volume 40 (חלק מ, published 5781), whose page exists without
  // a menu entry. So a volume those pages point into is read too. Volume
  // 41's page is not Likkutei Sichos at all (it is Sefer HaMaamarim
  // Melukat, which the maamorim section has), and no parsha or moad page
  // points into it, so it is never read.
  const listed = new Set(volumes.map((v) => v.slug));
  const unlisted = [...new Set(grouped.flatMap((g) => g.pages.flatMap((page) => page.itemIds.map((id) => id.split(':')[0]!))))]
    .filter((slug) => /^\d+$/.test(slug) && !listed.has(slug))
    .sort((a, b) => Number(a) - Number(b));
  for (const slug of unlisted) {
    const volume = Number(slug);
    const parsed = parseLsVolumePage(await fetchPage(ctx, jsTwinUrl(lsVolumePath(volume))));
    if (parsed.length === 0 || parsed.some((record) => record.volume !== volume)) {
      ctx.result.warnings.push(`likkuteiSichos: volume ${slug}, which the parsha/moad pages list, has no page of its own`);
      continue;
    }
    volumes.push({ slug, name: hebrewNumeral(volume), ord: volumes.length + 1 });
    addSichos(parsed);
  }

  inTransaction(ctx.db, () => {
    saveNav(ctx, 'likkuteiSichos', 'volume', volumes);
    for (const record of records.values()) {
      const status = upsertTracked(
        ctx.db,
        'ls_sichos',
        'id',
        {
          id: record.id,
          volume: record.volume,
          page: record.page,
          label: record.label,
          section_seq: record.sectionSeq,
          section_label: record.sectionLabel,
          ord: record.ord,
          kitzur_id: record.kitzurId,
          has_sicha: record.links.some((l) => l.role === 'sicha') ? 1 : 0,
          has_translated: record.links.some((l) => l.role === 'translated') ? 1 : 0,
          has_kitzur: record.links.some((l) => l.role === 'kitzur') ? 1 : 0,
        },
        hashValue(record),
        ctx.now,
      );
      countStatus(ctx, status);
      if (status !== 'unchanged') {
        replaceRows(
          ctx.db,
          'ls_links',
          { sicha_id: record.id },
          record.links.map((link) => ({ sicha_id: record.id, role: link.role, label: link.label, url: link.url })),
        );
      }
    }
    const known = new Set([...before, ...records.keys()]);
    for (const { kind, nav, pages } of grouped) {
      saveNav(ctx, 'likkuteiSichos', kind, nav);
      for (const page of pages) {
        saveMembership(ctx, 'likkuteiSichos', kind, page);
        const unknown = page.itemIds.filter((id) => !known.has(id));
        if (unknown.length > 0) ctx.result.warnings.push(`likkuteiSichos: by_${kind}/${page.slug} lists ${unknown.length} sicha(s) no volume page has: ${unknown.slice(0, 5).join(', ')}`);
      }
    }
  });
  finishIds(ctx, before, records.keys());
}
