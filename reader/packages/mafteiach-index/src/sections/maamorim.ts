import type { DatabaseSync } from 'node:sqlite';
import type { ResolvedJemAudio } from '../db.js';
import type { JemAudioRecording } from '../jemAudio.js';
import { countStatus, fetchEach, fetchPage, finishIds, flag, inTransaction, knownIds, monthToken, saveMembership, saveNav } from './context.js';
import type { SectionContext } from './context.js';
import { BASE_URL, cleanText, jsTwinUrl, loadSection } from './document.js';
import { hashValue, replaceRows, upsertTracked } from './tracked.js';
import type { MaamarDetail, MaamarLinkSection, MaamarListingEntry, MaamarRecord, MembershipPage, NavEntry } from './types.js';

/**
 * Maamorim: `/maamorim?order=by_year&year=Y` lists every maamar of a year
 * under its month groups (`group_{token}`, the same month tokens as the
 * farbrengen dates); `/maamorim?melukat=true&order=by_volume&volume=N`
 * lists the six volumes of ספר המאמרים מלוקט (membership); and
 * `/maamorim/{id}/fragment.js` has a maamar's links - the מוגה links'
 * labels are the printed citations (סה"מ מלוקט ח"א/ ...), which is how a
 * maamar is found in the printed volumes. The farbrengen a maamar belongs
 * to is already known: the farbrengen fragments link to `/maamorim/{id}`
 * (the `links` table), and the maamar fragment's "ראה ההתוועדות" link
 * gives the date as a cross-check. The tochen inyanim is only a flag.
 */

export const MAAMORIM_ENTRY_YEAR = 5711;

const LOAD_MAAMOR = /loadMaamorFragment\(event,\s*(\d+)/;
const ALL_DATE_HREF = /^\/all\/(\d{4}-\d{2}[AB]?-\d{2}[a-z]?)$/;

export function maamorimYearPath(year: number | string): string {
  return `/maamorim?order=by_year&year=${year}`;
}

export function melukatVolumePath(volume: number | string): string {
  return `/maamorim?melukat=true&order=by_volume&volume=${volume}`;
}

export function maamarFragmentUrl(id: number): string {
  return `${BASE_URL}/maamorim/${id}/fragment.js`;
}

/** The tabs of a maamorim page: years on a by_year page, volumes on a Melukat page. */
export function parseMaamorimTabs(raw: string, key: 'year' | 'volume'): NavEntry[] {
  const $ = loadSection(raw);
  const pattern = new RegExp(`[?&]${key}=(\\d+)`);
  const entries: NavEntry[] = [];
  $('a[id^="right_nav_tab_"]').each((_, a) => {
    const match = ($(a).attr('data-ajax-url') ?? $(a).attr('href') ?? '').match(pattern);
    if (!match) return;
    entries.push({ slug: match[1]!, name: cleanText($(a).text()), ord: entries.length + 1 });
  });
  return entries;
}

/** The maamorim a by_year or Melukat page lists, in page order. Melukat pages have no month groups, and their first line carries the year. */
export function parseMaamorimListing(raw: string, hebrewYear: number | null): MaamarListingEntry[] {
  const $ = loadSection(raw);
  const entries: MaamarListingEntry[] = [];
  $('div.farbrengen[id^="maamor_"]').each((_, item) => {
    const button = $(item).children('button').first();
    const match = LOAD_MAAMOR.exec(button.attr('onclick') ?? '');
    if (!match) return;
    const lines = button.find('.tw-flex-col').first().children('div');
    const titleLine = lines.eq(1);
    const titleText = cleanText(titleLine.text());
    const dibur = cleanText(titleLine.find('span.thick-font').first().text()) || titleText.replace(/\[[^\]]*\]/g, '').trim();
    const hemshech = /\[המשך:\s*([^\]]+)\]/.exec(titleText)?.[1]?.trim() ?? null;
    let kuntres: string | null = null;
    lines.each((__, line) => {
      const text = cleanText($(line).text());
      if (text.startsWith('קונטרס:')) kuntres = text.slice('קונטרס:'.length).trim();
    });
    const group = /^group_(\w+)$/.exec($(item).closest('div.month').attr('id') ?? '')?.[1];
    entries.push({
      id: Number(match[1]),
      hebrewYear,
      monthToken: group ? monthToken(group) : null,
      occasionLabel: cleanText(lines.eq(0).text()),
      diburHamaschil: dibur,
      hemshech,
      kuntres,
    });
  });
  return entries;
}

function hanachaSection(group: string | null): MaamarLinkSection {
  if (group && /בלתי מוגה/.test(group)) return 'biltiMugah';
  if (group && /^מוגה/.test(group)) return 'mugah';
  return 'hanachos';
}

/** A maamar's links and flags from its fragment. */
export function parseMaamarFragment(raw: string, id: number): MaamarDetail {
  const $ = loadSection(raw);
  const links: MaamarDetail['links'] = [];

  // The "הנחות" panel groups its links under h5 headings (מוגה, בלתי מוגה - מהדורה ישנה, ...).
  $('.bilti-muga-sichos-content, .muga-sichos-content').each((_, panel) => {
    const fallback: MaamarLinkSection = $(panel).hasClass('muga-sichos-content') ? 'mugah' : 'hanachos';
    let group: string | null = null;
    $(panel)
      .find('h5, a[href]')
      .each((__, el) => {
        if (el.tagName === 'h5') {
          group = cleanText($(el).text()).replace(/:$/, '') || null;
          return;
        }
        const section = group ? hanachaSection(group) : fallback;
        links.push({ section, group, label: cleanText($(el).text()), url: $(el).attr('href')! });
      });
  });
  $('.hagahos-content a[href]').each((_, a) => {
    links.push({ section: 'hagahos', group: null, label: cleanText($(a).text()), url: $(a).attr('href')! });
  });
  $('a[class*="audio-button"][href]').each((_, a) => {
    links.push({ section: 'audio', group: null, label: cleanText($(a).text()), url: $(a).attr('href')! });
  });
  $('a[class*="video-button"][href]').each((_, a) => {
    links.push({ section: 'video', group: null, label: cleanText($(a).text()), url: $(a).attr('href')! });
  });
  for (const embed of raw.matchAll(/addYouTubeEmbed\(\s*'([^']+)'/g)) {
    links.push({ section: 'video', group: null, label: 'YouTube', url: `https://www.youtube.com/watch?v=${embed[1]}` });
  }

  const tochenButton = $('button.tochen_inyonim-button').filter((_, b) => ($(b).attr('onclick') ?? '').includes('תוכן ענינים'));
  let hebrewDate: string | null = null;
  $(`#maamor_${id}_oid_content a[href], a[href^="/all/"]`).each((_, a) => {
    const match = ALL_DATE_HREF.exec($(a).attr('href') ?? '');
    if (match && !hebrewDate) hebrewDate = match[1]!;
  });

  return {
    links,
    hasVideo: links.some((l) => l.section === 'video'),
    hasTochenInyanim: tochenButton.length > 0 && !tochenButton.hasClass('farbrengen-detail-button-disabled'),
    hebrewDate,
  };
}

/** Maamar id -> the farbrengen occasion whose fragment links to `/maamorim/{id}`. */
export function maamarOccasions(db: DatabaseSync): Map<number, number> {
  const rows = db.prepare("SELECT occasion_id, url FROM links WHERE section = 'maamorim' AND url LIKE '/maamorim/%' ORDER BY occasion_id").all() as Array<{ occasion_id: number; url: string }>;
  const map = new Map<number, number>();
  for (const row of rows) {
    const id = Number(row.url.slice('/maamorim/'.length));
    if (Number.isInteger(id) && !map.has(id)) map.set(id, row.occasion_id);
  }
  return map;
}

export async function crawlMaamorim(ctx: SectionContext): Promise<void> {
  const before = knownIds(ctx.db, 'maamorim', 'id');

  const yearEntry = await fetchPage(ctx, jsTwinUrl(maamorimYearPath(MAAMORIM_ENTRY_YEAR)));
  const years = parseMaamorimTabs(yearEntry, 'year');
  const listing = new Map<number, MaamarListingEntry>();
  for (const { item, raw } of await fetchEach(ctx, 'years', years, (y) => jsTwinUrl(maamorimYearPath(y.slug)))) {
    const entries = parseMaamorimListing(raw, Number(item.slug));
    if (entries.length === 0) ctx.result.warnings.push(`maamorim: year ${item.slug} listed nothing`);
    for (const entry of entries) {
      if (listing.has(entry.id)) ctx.result.warnings.push(`maamorim: maamar ${entry.id} listed under two years`);
      else listing.set(entry.id, entry);
    }
  }

  const melukatEntry = await fetchPage(ctx, jsTwinUrl(melukatVolumePath(1)));
  const volumes = parseMaamorimTabs(melukatEntry, 'volume');
  const melukat: MembershipPage[] = [];
  for (const { item, raw } of await fetchEach(ctx, 'melukat', volumes, (v) => jsTwinUrl(melukatVolumePath(v.slug)))) {
    const entries = parseMaamorimListing(raw, null);
    for (const entry of entries) if (!listing.has(entry.id)) listing.set(entry.id, entry);
    melukat.push({ slug: item.slug, itemIds: entries.map((e) => String(e.id)) });
  }

  const ids = [...listing.keys()].sort((a, b) => a - b);
  const records: MaamarRecord[] = [];
  for (const { item: id, raw } of await fetchEach(ctx, 'fragments', ids, (id) => maamarFragmentUrl(id))) {
    records.push({ ...listing.get(id)!, detail: parseMaamarFragment(raw, id) });
  }

  const occasionOf = maamarOccasions(ctx.db);
  const occasionDate = new Map(
    (ctx.db.prepare('SELECT id, hebrew_date FROM occasions').all() as Array<{ id: number; hebrew_date: string }>).map((row) => [row.id, row.hebrew_date]),
  );
  let unlinked = 0;
  let dateMismatch = 0;

  inTransaction(ctx.db, () => {
    saveNav(ctx, 'maamorim', 'year', years);
    saveNav(ctx, 'maamorim', 'melukat', volumes);
    for (const record of records) {
      const occasionId = occasionOf.get(record.id) ?? null;
      if (occasionId === null) unlinked += 1;
      else if (record.detail.hebrewDate && occasionDate.get(occasionId) !== record.detail.hebrewDate) dateMismatch += 1;
      const has = (section: MaamarLinkSection) => flag(record.detail.links.some((l) => l.section === section));
      const status = upsertTracked(
        ctx.db,
        'maamorim',
        'id',
        {
          id: record.id,
          hebrew_year: record.hebrewYear,
          month_token: record.monthToken,
          occasion_label: record.occasionLabel,
          dibur_hamaschil: record.diburHamaschil,
          hemshech: record.hemshech,
          kuntres: record.kuntres,
          hebrew_date: record.detail.hebrewDate,
          occasion_id: occasionId,
          has_mugah: has('mugah'),
          has_bilti_mugah: has('biltiMugah'),
          has_audio: has('audio'),
          has_video: flag(record.detail.hasVideo),
          has_tochen_inyanim: flag(record.detail.hasTochenInyanim),
          has_hagahos: has('hagahos'),
        },
        hashValue({ record, occasionId }),
        ctx.now,
      );
      countStatus(ctx, status);
      if (status !== 'unchanged') {
        replaceRows(
          ctx.db,
          'maamorim_links',
          { maamor_id: record.id },
          record.detail.links.map((link) => ({ maamor_id: record.id, section: link.section, group_label: link.group, label: link.label, url: link.url })),
        );
      }
    }
    for (const page of melukat) saveMembership(ctx, 'maamorim', 'melukat', page);
  });

  if (unlinked > 0) ctx.result.warnings.push(`maamorim: ${unlinked} maamar(im) no farbrengen links to`);
  if (dateMismatch > 0) ctx.result.warnings.push(`maamorim: ${dateMismatch} maamar(im) whose "ראה ההתוועדות" date differs from the linking farbrengen's`);
  finishIds(
    ctx,
    before,
    records.map((r) => String(r.id)),
  );
}

/** JEM's names for a farbrengen's maamar part: "Ma’amar", "Ma'amar 2", "Maamar", "Ma’amar Basi Legani" - not "Ma’amar Nigun". */
const MAAMAR_PART = /^ma[’'`]?amar\b(?!\s+nigun)/i;

/**
 * The fallback for a maamar whose own ccdb event is gone (JEM renumbered
 * the farbrengen's parts): of the farbrengen's recordings, the one part
 * named as a maamar - or nothing when there are none or several, since
 * then the part can't be told apart from its name alone.
 */
export function pickMaamarPart(recordings: JemAudioRecording[]): JemAudioRecording[] {
  const parts = [...new Set(recordings.filter((r) => r.chapterName !== null && MAAMAR_PART.test(r.chapterName.trim())).map((r) => r.eventId))];
  return parts.length === 1 ? recordings.filter((r) => r.eventId === parts[0]) : [];
}

/** Replaces a maamar's resolved JEM audio (the same shape as `replaceJemAudio` for occasions). */
export function replaceMaamarJemAudio(db: DatabaseSync, maamorId: number, recordings: ResolvedJemAudio[], now: string): void {
  db.prepare('DELETE FROM maamor_jem_audio WHERE maamor_id = ?').run(maamorId);
  const insert = db.prepare(
    'INSERT INTO maamor_jem_audio (maamor_id, ccdb_event_id, chapter_index, chapter_name, duration_ms, url, file_format, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const r of recordings) insert.run(maamorId, r.ccdbEventId, r.chapterIndex, r.chapterName, r.durationMs, r.url, r.fileFormat, now);
}
