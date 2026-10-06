import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { extractHtmlLiteral } from './htmlLiteral.js';
import type { FarbrengenDetail, LinkRef, LinkSection } from './types.js';

type Cheerio$ = ReturnType<typeof cheerio.load>;

/**
 * Link-bearing sections: presence of the section's own content class is
 * itself the "has content" signal — mafteiach.app only ever attaches the
 * kind-specific class (`muga-sichos-button`, `english-button`, ...) to a
 * button when there's something behind it. A disabled section drops the
 * kind-specific class entirely and keeps only a generic
 * `farbrengen-detail-button-disabled` class plus its Hebrew label text, so
 * detecting via the specific class (rather than checking for "disabled")
 * is the robust direction.
 *
 * `hagahos` belongs here (a plain link list) — `hosofos` does not, despite
 * looking like a sibling tab: it's free-text like `tochenInyanim` (see
 * `parseNoteSection`).
 */
const LINK_SECTIONS: Array<{ key: keyof Pick<FarbrengenDetail, 'biltiMugah' | 'mugah' | 'maamorim' | 'english' | 'hagahos'>; contentClass: string }> = [
  { key: 'biltiMugah', contentClass: 'bilti-muga-sichos-content' },
  { key: 'mugah', contentClass: 'muga-sichos-content' },
  { key: 'maamorim', contentClass: 'maamorim-content' },
  { key: 'english', contentClass: 'english-content' },
  { key: 'hagahos', contentClass: 'hagahos-content' },
];

/** Sub-headings mafteiach.app uses inside a panel to group its links (e.g. "ליקוט:" / "הנחה:" under מוגה, a maamor's title under מאמרים). */
const GROUP_HEADING_SELECTOR = 'h5, .maamor-header, .maamor-section-title';

function extractLinks($: Cheerio$, panel: ReturnType<Cheerio$>): LinkRef[] {
  const links: LinkRef[] = [];
  let currentGroup: string | undefined;
  panel.find(`${GROUP_HEADING_SELECTOR}, a[href]`).each((_, el: AnyNode) => {
    const $el = $(el);
    if ($el.is(GROUP_HEADING_SELECTOR)) {
      const text = $el.text().replace(/:\s*$/, '').trim();
      currentGroup = text || undefined;
      return;
    }
    const url = $el.attr('href');
    const label = $el.text().trim();
    if (!url || !label) return;
    links.push(currentGroup ? { label, url, group: currentGroup } : { label, url });
  });
  return links;
}

function parseLinkSection($: Cheerio$, contentClass: string): LinkSection {
  const panel = $(`.${contentClass}`).first();
  if (panel.length === 0) return { hasContent: false, links: [] };
  return { hasContent: true, links: extractLinks($, panel) };
}

function parseAudioSection($: Cheerio$): FarbrengenDetail['audio'] {
  const audioLinks = $('a[class*="audio-button"]');
  if (audioLinks.length === 0) return { hasContent: false, links: [] };
  const links: LinkRef[] = [];
  audioLinks.each((_, el) => {
    const $el = $(el);
    const url = $el.attr('href');
    if (!url) return;
    links.push({ label: $el.text().trim() || 'audio', url });
  });
  return { hasContent: links.length > 0, links };
}

/**
 * Video has two distinct shapes: a `sicha_video-button` that embeds a
 * YouTube player via `addYouTubeEmbed(id, ...)`, or - about a quarter of
 * all video occasions - a plain outbound `<a class="... video-button
 * button">` (chabad.org's Living Torah player, JEM's videos.jem.tv,
 * Vimeo, Drive, or a legacy 770live.com). A fragment's video slot is
 * always one or the other, never both, but both are checked
 * unconditionally rather than assuming which.
 */
function parseVideoSection($: Cheerio$, rawHtml: string): FarbrengenDetail['video'] {
  const youtubeIds = [...rawHtml.matchAll(/addYouTubeEmbed\('([^']+)'/g)].map((m) => m[1]!);
  const links: LinkRef[] = [];
  $('a[class*="video-button"]').each((_, el) => {
    const $el = $(el);
    const url = $el.attr('href');
    if (!url) return;
    links.push({ label: $el.text().trim() || 'video', url });
  });
  return { hasContent: youtubeIds.length > 0 || links.length > 0, youtubeIds, links };
}

/** Shared by `tochenInyanim` and `hosofos`: free-text editorial content, possibly with inline links, wrapped in a `.trix-content` block. */
function parseNoteSection($: Cheerio$, contentClass: string): FarbrengenDetail['tochenInyanim'] {
  const panel = $(`.${contentClass} .trix-content`).first();
  if (panel.length === 0) return { hasContent: false, text: null, links: [] };
  const links = extractLinks($, panel);
  const clone = panel.clone();
  clone.find('br').replaceWith('\n');
  const text = clone.text().replace(/[ \t]+\n/g, '\n').trim();
  return { hasContent: text.length > 0, text: text.length > 0 ? text : null, links };
}

/**
 * Parses a `/all/{id}/fragment.js` response into the full per-farbrengen
 * breakdown: mugah / bilti-mugah / maamorim texts (each with their source
 * links, e.g. Google Drive-hosted scans and their printed-volume
 * citations), audio (links out to ashreinu.app, JEM's audio app), video
 * (embedded YouTube ids), English translation links, mafteiach.app's own
 * editorial content-outline, hagahos (annotations/corrections, a link
 * list), and hosofos (addenda, free-text like the content-outline — not a
 * link list despite the similar-looking tab).
 */
export function parseFragmentPage(rawResponse: string, id: number): FarbrengenDetail {
  const html = extractHtmlLiteral(rawResponse);
  const $ = cheerio.load(html);

  const detail = { id } as FarbrengenDetail;
  for (const { key, contentClass } of LINK_SECTIONS) {
    detail[key] = parseLinkSection($, contentClass);
  }
  detail.audio = parseAudioSection($);
  detail.video = parseVideoSection($, html);
  detail.tochenInyanim = parseNoteSection($, 'tochen_inyonim-content');
  detail.hosofos = parseNoteSection($, 'hosofos-content');
  return detail;
}
