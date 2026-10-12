import { hayomYomShiurimOf, type HayomYomShiurim } from '@chassidushub/hebrew';
import type { PageSegment } from '@chassidushub/model';
import { nameOf } from '../lib/catalog';
import type { WordsLayout } from '../reader/words.server';

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const TORAH = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];

/**
 * A shiur's page on ChassidusHub, by its Sefaria reference, at the paths the
 * Sefaria importer gives Chitas (packages/core daily.ts, `dailyPathOf`):
 * `Genesis 32:4-13` is `/chumash/genesis/32#s-4`, `Psalms 119:97-176`
 * `/tehillim/119#s-97`. Null for a reference it does not place.
 */
export function shiurPath(ref: string | null): string | null {
  const m = ref && /^(.*) (\d+)(?::(\d+))?(?:-[\d:]+)?$/.exec(ref);
  if (!m) return null;
  const [, book, chapter, verse] = m;
  const at = verse && verse !== '1' ? `#s-${verse}` : '';
  if (TORAH.includes(book!)) return `/chumash/${book!.toLowerCase()}/${chapter}${at}`;
  if (book === 'Psalms') return `/tehillim/${chapter}${at}`;
  return null;
}

/** A shiur as printed: a link to its words where ChassidusHub has a page for them, else its words alone. */
const shiur = (text: string, path: string | null) => (path ? `<a href="${escape(path)}">${escape(text)}</a>` : escape(text));

/** The day's parts as the book sets them, from its segments: see `daybookLayout`. */
export interface DayParts {
  lead: PageSegment[];
  pre: PageSegment[];
  after: PageSegment[];
  tanya: PageSegment | null;
  close: PageSegment[];
  words: PageSegment[];
}

/**
 * A day's segments parted as the book sets them (the old site's
 * HayomYomDay, PR #104): `lead-…` above the day's head, `pre-…` and the
 * day's first `before` paragraphs among the notices above the shiurim,
 * `after-…` and the `after` paragraphs that follow them right after the
 * shiurim, `tanya` the print's Tanya line, `close-…` after the words.
 */
export function dayParts(segments: readonly PageSegment[], before: number, after: number): DayParts {
  const out: DayParts = { lead: [], pre: [], after: [], tanya: null, close: [], words: [] };
  let notices = before;
  let following = after;
  for (const s of segments) {
    if (s.id.startsWith('lead-')) out.lead.push(s);
    else if (s.id.startsWith('pre-')) out.pre.push(s);
    else if (s.id.startsWith('after-')) out.after.push(s);
    else if (s.id === 'tanya') out.tanya = s;
    else if (s.id.startsWith('close-')) out.close.push(s);
    else if (notices > 0 && s.kind === 'paragraph') {
      out.pre.push(s);
      notices--;
    } else if (following > 0 && s.kind === 'paragraph') {
      out.after.push(s);
      following--;
    } else out.words.push(s);
  }
  return out;
}

/** "שיעורים." beside its three lines: Chumash, Tehillim and Tanya, each a link to its words. */
function shiurimHtml(shiurim: HayomYomShiurim, tanya: string): string {
  const tehillim = shiurim.tehillimParts.map((part) => shiur(part.text, shiurPath(part.ref))).join(' ');
  const tanyaLine = tanya || (shiurim.tanya ? `<p>${escape(shiurim.tanya.label)}.</p>` : '');
  const tanyaPath = shiurim.tanya?.path ? `${shiurim.tanya.path}${shiurim.tanya.segment !== '1' ? `#s-${shiurim.tanya.segment}` : ''}` : null;
  const rows = [
    `<span class="hy-k">שיעורים.</span><span class="hy-n">חומש:</span><div class="hy-v">${shiur(shiurim.chumash, shiurPath(shiurim.chumashRef))}</div>`,
    `<span class="hy-n">תהלים:</span><div class="hy-v">${tehillim}</div>`,
    // A line that carries a link of its own (a note's mark) is not wrapped in another: links never nest.
    tanyaLine ? `<span class="hy-n">תניא:</span><div class="hy-v hy-tanya">${tanyaPath && !tanyaLine.includes('<a ') ? `<a href="${escape(tanyaPath)}">${tanyaLine}</a>` : tanyaLine}</div>` : '',
  ];
  return `<div class="hy-shiurim">${rows.join('')}</div>`;
}

/**
 * A day of Hayom Yom set as the book prints it, and as the old site set it
 * (PR #104, #105, apps/web HayomYomDay): the letter the book opens with, over
 * its first day; a row with the weekday, the day and the year; the day's
 * notices the book sets above the shiurim; "שיעורים." with Chumash, Tehillim
 * and Tanya, each a link to that day's piece where ChassidusHub has it; the
 * notices right after them; the day's words; and the blessing the book ends
 * with, under a star. No rules above or under the text (#105).
 *
 * The weekday, the year, the shiurim and which first paragraphs are notices
 * come from the calendar of 5703 and the scan (@chassidushub/hebrew
 * hayomYom.ts). What the print has and the day's text source lacks is in the
 * day's own words, read off the scan and marked as a machine's until a
 * person checks it, as every page marks such words. A day the calendar does
 * not place is drawn as plain words.
 */
export const daybookLayout: WordsLayout = {
  body: (segments, item, draw) => {
    const shiurim = hayomYomShiurimOf(item);
    if (!shiurim) return draw(segments);
    const title = nameOf((item as { label?: unknown }).label);
    const parts = dayParts(segments, shiurim.before, shiurim.after);
    const block = (cls: string, list: readonly PageSegment[]) => (list.length ? `<div class="${cls}">${draw(list)}</div>` : '');
    return [
      block('hy-lead', parts.lead),
      `<div class="hy-head"><span>${escape(shiurim.weekday)}</span><span>${escape(title)}</span><span>${escape(shiurim.year)}</span></div>`,
      block('hy-pre', parts.pre),
      shiurimHtml(shiurim, parts.tanya ? draw([parts.tanya]) : ''),
      block('hy-after', parts.after),
      draw(parts.words),
      parts.close.length ? `<div class="hy-close"><span class="hy-star" aria-hidden="true">*</span>${draw(parts.close)}</div>` : '',
    ].join('');
  },
};
