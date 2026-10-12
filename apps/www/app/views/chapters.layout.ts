import { toHebrewNumeral } from '@chassidushub/hebrew';
import type { ItemView } from '@chassidushub/client';
import type { PageInline, PageSegment } from '@chassidushub/model';
import { nameOf } from '../lib/catalog';
import type { Chip } from '../reader/types';
import type { WordsContext, WordsLayout } from '../reader/words.server';

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A seif's number as the margin shows it: `ג`, `יט`, with no quote marks. */
const numeral = (n: number) => toHebrewNumeral(n).replace(/[׳״]/g, '');

/** The levels of a unit's position (`section`, `siman`, `seif`). */
const levelsOf = (item: unknown) => ((item as { position?: { level?: unknown }[] } | undefined)?.position ?? []).map((p) => p.level);

/** A unit of a book of simanim (Shulchan Aruch HaRav), whose paragraphs are its seifim; else a book of chapters (Tanya). */
export const isSiman = (item: unknown) => levelsOf(item).includes('siman');

/**
 * Words in parentheses, a little quieter than the ruling around them, as
 * Shulchan Aruch HaRav prints them in smaller type. Only the words between
 * tags are read, so a parenthesis never takes in a mark or a link.
 */
export const quietParens = (html: string) =>
  html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith('<') ? part : part.replace(/\([^()]*\)/g, (words) => `<span class="paren">${words}</span>`)))
    .join('');

/** A segment's runs cut at its line breaks, each line its own runs. */
function lines(text: readonly PageInline[]): PageInline[][] {
  const out: PageInline[][] = [[]];
  for (const inline of text) {
    if ('br' in inline) out.push([]);
    else out.at(-1)!.push(inline);
  }
  return out.filter((line) => line.some((inline) => !('text' in inline) || inline.text.trim()));
}

/** Whether every word of a line carries `mark`: the print's small preface, or the siman's bold name. */
const allMarked = (line: readonly PageInline[], mark: 'small' | 'b') => line.every((inline) => !('text' in inline) || !inline.text.trim() || inline.marks?.includes(mark));

/**
 * A siman's seifim, each numbered in the margin (`סעיף ג`), so a link to
 * `#s-3` opens that seif. Today the first seif may also hold what the print
 * sets over it: the preface (in small type) and the siman's name with its
 * count of seifim (in bold), each a line of its own; they are set apart, a
 * quiet block and a centred heading, inside the same paragraph, so a fix
 * still knows its place. Catalog splits them out later (#323).
 */
function seifim(segments: readonly PageSegment[], draw: (segments: readonly PageSegment[]) => string, context: WordsContext): string {
  return segments
    .map((segment, at) => {
      const n = numeral(segment.n ?? at + 1);
      const drawn = draw([segment]);
      if (!drawn.startsWith('<p') || segment.kind === 'heading' || segment.kind === 'section') return drawn;
      const parts = lines(segment.text ?? []);
      const lead = parts.length > 1 ? parts.slice(0, -1) : [];
      if (!lead.length || !lead.every((line) => allMarked(line, 'small') || allMarked(line, 'b'))) {
        return quietParens(drawn.replace(/^<p /, `<p data-seif="${n}" `));
      }
      const open = drawn.slice(0, drawn.indexOf('>') + 1);
      const inner = [
        ...lead.map((line) => `<span class="${allMarked(line, 'small') ? 'sa-pre' : 'sa-name'}">${context.run(line)}</span>`),
        `<span class="sa-body" data-seif="${n}">${quietParens(context.run(parts.at(-1)!))}</span>`,
      ];
      return `${open}${inner.join('')}</p>`;
    })
    .join('');
}

/**
 * A chapter read in two languages side by side (Tanya with its English
 * translation, ?language=both): each paragraph beside the same paragraph in
 * the other language, matched by the segment's id. The page's own words keep
 * their ids (`s-`), so fixing them works as on any page; the translation's
 * paragraphs are only read (`t-`).
 */
function paired(segments: readonly PageSegment[], draw: (segments: readonly PageSegment[]) => string, context: WordsContext): string {
  const beside = new Map((context.beside?.segments ?? []).map((segment) => [segment.id, segment]));
  return segments
    .map((segment) => {
      const other = beside.get(segment.id);
      const translation = other ? `<p class="tr" id="t-${escape(other.id)}" lang="${escape(context.beside!.language)}" dir="ltr">${context.run(other.text ?? [])}</p>` : '<p class="tr"></p>';
      return `<div class="pair">${draw([segment])}${translation}</div>`;
    })
    .join('');
}

/**
 * Tanya and Shulchan Aruch HaRav (RFC 0004, view `chapters`): a chapter is
 * read as any page's words, its opening words in bold as printed, nikud
 * kept, the daily-shiur markers hidden (ui.css); in two languages side by
 * side when asked; a siman with its seifim numbered in the margin.
 */
export const chaptersLayout: WordsLayout = {
  body: (segments, item, draw, context) => {
    if (context.beside) return paired(segments, draw, context);
    if (isSiman(item)) return seifim(segments, draw, context);
    return draw(segments);
  },
};

/** A siman's label without its section and edition: `סימן א׳`. */
const simanOf = (label: string) => label.split(', ').at(-1) ?? label;

/**
 * The chips under a siman's title: its count of seifim, and its editions,
 * each a link to the same siman in the other (Mahadura Kama and Mahadura
 * Tinyana), found among the units the path bar already lists, so the page
 * reads nothing more; Kuntres Acharon marks a siman of its own. A chapter of
 * Tanya has none: its row of chapters is drawn by the view.
 */
export function simanChips(view: ItemView, segments: readonly PageSegment[]): Chip[] {
  const data = view.item.data as { position?: { label?: unknown; level?: unknown }[] };
  if (!isSiman(data)) return [];
  const chips: Chip[] = [];
  const count = segments.filter((s) => s.kind !== 'heading' && s.kind !== 'section').length;
  if (count > 1) chips.push({ label: `${toHebrewNumeral(count)} סעיפים` });
  const labels = (data.position ?? []).map((p) => nameOf(p.label));
  const title = nameOf(view.pathBar.at(-1)?.chosen.name);
  const siman = simanOf(title);
  if (labels.includes('קונטרס אחרון')) return [...chips, { label: 'קונטרס אחרון', current: true }];
  const tinyana = labels.includes('מהדורא תניינא');
  // The other edition of this siman: Mahadura Tinyana's simanim are listed among the section's, and the section's among Tinyana's.
  const others = view.pathBar.slice(-2).flatMap((level) => level.choices ?? []);
  const other = others.find((c) => c.path && c.path !== view.item.path && simanOf(nameOf(c.name)) === siman && nameOf(c.name).includes('מהדורא תניינא') !== tinyana);
  if (tinyana) {
    if (other?.path) chips.push({ label: 'מהדורא קמא', href: other.path });
    chips.push({ label: 'מהדורא תניינא', current: true });
  } else if (other?.path) chips.push({ label: 'מהדורא תניינא', href: other.path });
  return chips;
}
