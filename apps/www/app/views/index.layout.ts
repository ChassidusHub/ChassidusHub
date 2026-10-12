import { normalizeSearchText, parseHebrewNumeral, unfinal } from '@chassidushub/hebrew';
import type { PageInline, PageSegment } from '@chassidushub/model';
import type { WordsContext, WordsLayout } from '../reader/words.server';

/**
 * A subject index (mafteach) set as it was printed: each entry its heading
 * word in bold, then its page references, each with the short note the index
 * prints beside it, then "ע״ע" and the other entries it sends to. The words
 * are the index's own (packages/core/src/mafteach.ts reads the same): a
 * heading segment for each entry, and under it a paragraph of its places, in
 * the merged index one paragraph a volume, led by the volume in bold
 * ("חלק ל: 240 (…)"). Every segment keeps its own element and id, so a fix
 * finds it as on any page.
 *
 * A page number the index links (`/read?page=&title=&src=`, the sicha's PDF)
 * is drawn as a reference: without script it opens that PDF; with it, a tap
 * names the sicha and opens it here (app/views/index.tsx). A page number with
 * no link stays plain, as printed. Above the entries, a strip of letters:
 * each jumps to its first entry, or, in the merged index kept one letter a
 * page, opens that letter's page.
 */

const LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';

/** A heading or a name after ע״ע, as headings are compared: no quotes or points, final letters as ordinary ones. */
export const entryKey = (text: string) => unfinal(normalizeSearchText(text));

const plain = (text: readonly PageInline[] | undefined) => (text ?? []).map((r) => ('text' in r ? r.text : '')).join('');

/** A page number, or a range of them, as an index prints it: `240`, `16-119`. */
const PAGES = /^\s*(\d+)(?:-\d+)?\s*$/;
/** The index's own link to a page (packages/core/src/mafteach.ts, `placesOf`). */
const isReadHref = (href: string | undefined): href is string => !!href && href.startsWith('/read?');
/** "See also" as the indexes print it: ע״ע, ע"ע, עיי״ע, עיין ערך. */
const SEE = /(עיי?["״]ע|ע["״]ע|עיין ערך)/;

/**
 * Whether a page's words are an index's: entries under headings whose
 * paragraphs are mostly page references. The catalog will name an index's
 * view (RFC 0004, `view: "index"`); until /v1/view says so, the words' own
 * shape picks it, so no sicha is ever set as an index.
 */
export function isIndexWords(segments: readonly PageSegment[]): boolean {
  let headings = 0;
  let paragraphs = 0;
  let withPages = 0;
  for (const s of segments) {
    if (s.kind === 'heading') headings++;
    else if (s.kind === 'paragraph') {
      paragraphs++;
      if ((s.text ?? []).some((r) => 'text' in r && isReadHref(r.href) && PAGES.test(r.text))) withPages++;
    }
  }
  return headings >= 2 && paragraphs > 0 && withPages / paragraphs >= 0.5;
}

/** A Drive file's id, from any of its link shapes (as packages/core/src/mafteach.ts, `driveId`). */
const driveId = (url: string) => /\/d\/([\w-]{10,})/.exec(url)?.[1] ?? /[?&]id=([\w-]{10,})/.exec(url)?.[1] ?? null;

/** Where a reference opens without script: the sicha's PDF, as the index links it. */
function pdfOf(href: string): string | null {
  const query = new URLSearchParams(href.slice(href.indexOf('?') + 1));
  const src = query.get('src') ?? '';
  const drive = driveId(src);
  if (drive) return `https://drive.google.com/file/d/${drive}/view`;
  return /^https:\/\//.test(src) ? src : null;
}

/** The sicha a reference is in, as the index names it ("ח״ל ע׳ 236 (ויחי א)"). */
const sichaOf = (href: string) => new URLSearchParams(href.slice(href.indexOf('?') + 1)).get('title')?.trim() ?? '';

/** The volume a paragraph of the merged index leads with in bold ("חלק ל"), else none. */
function volumeLed(text: readonly PageInline[] | undefined): number | null {
  const first = text?.find((r) => 'text' in r && r.text.trim());
  if (!first || !('text' in first) || !first.marks?.includes('b')) return null;
  const named = /^\s*חלק\s+(\S+)\s*$/.exec(first.text);
  return named ? parseHebrewNumeral(named[1]!) : null;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The first letter an entry is filed under. */
const letterOf = (heading: string) => {
  const first = entryKey(heading)[0];
  return first && LETTERS.includes(first) ? first : null;
};

/**
 * The names after "ע״ע", each a link to that entry on this page when it is
 * here; the words themselves are kept exactly, so a fix counts them as drawn.
 */
function seeAlso(text: string, entries: ReadonlyMap<string, string>): string {
  return text
    .split(/([.,;]+)/)
    .map((piece, at) => {
      if (at % 2 || !piece.trim()) return escape(piece);
      const id = entries.get(entryKey(piece));
      if (!id) return escape(piece);
      const [, before, name, after] = /^(\s*)(.*?)(\s*)$/s.exec(piece)!;
      return `${escape(before!)}<a class="see" href="#s-${escape(id)}">${escape(name!)}</a>${escape(after!)}`;
    })
    .join('');
}

/** An entry's paragraph: its references, its notes and its "see also", every run as the index has it. */
function placesHtml(text: readonly PageInline[], volume: number | null, entries: ReadonlyMap<string, string>, context: WordsContext): string {
  let seeing = false;
  return text
    .map((r) => {
      if (!('text' in r)) return context.run([r]);
      if (isReadHref(r.href) && PAGES.test(r.text)) {
        const pdf = pdfOf(r.href);
        const page = PAGES.exec(r.text)![1];
        const data = `data-p="${page}"${volume ? ` data-v="${volume}"` : ''} data-s="${escape(sichaOf(r.href))}"`;
        return pdf ? `<a class="ref" href="${escape(pdf)}" rel="noopener" target="_blank" ${data}>${escape(r.text)}</a>` : `<span class="ref" ${data}>${escape(r.text)}</span>`;
      }
      if (r.href || r.marks?.length) return context.run([r]);
      if (seeing) return seeAlso(r.text, entries);
      const see = SEE.exec(r.text);
      if (!see) return escape(r.text);
      seeing = true;
      const at = see.index + see[0].length;
      return escape(r.text.slice(0, at)) + seeAlso(r.text.slice(at), entries);
    })
    .join('');
}

/** The letters strip: this page's letters, each opening its first entry; or, one letter a page, the index's other pages. */
function lettersHtml(firsts: ReadonlyMap<string, string>, context: WordsContext): string {
  const pages = context.siblings?.flatMap((s) => {
    const letter = /^אות\s+(\S)$/.exec(s.label.trim())?.[1];
    return letter ? [{ ...s, letter }] : [];
  });
  if (firsts.size <= 1 && pages && pages.length > 1) {
    return `<nav class="ix-ab" aria-label="לפי אות">${pages
      .map((p) => `<a href="${escape(p.path)}"${p.current ? ' aria-current="page"' : ''}>${escape(p.letter)}</a>`)
      .join('')}</nav>`;
  }
  if (firsts.size <= 1) return '';
  return `<nav class="ix-ab" aria-label="לפי אות">${[...LETTERS]
    .map((letter) => {
      const id = firsts.get(letter);
      return id ? `<a href="#s-${escape(id)}">${letter}</a>` : `<span aria-hidden="true">${letter}</span>`;
    })
    .join('')}</nav>`;
}

/** The index's entries as the server draws them (see the top of this file). */
export const indexLayout: WordsLayout = {
  classes: () => new Map(),
  body(segments, context) {
    const entries = new Map<string, string>();
    const firsts = new Map<string, string>();
    for (const s of segments) {
      if (s.kind !== 'heading') continue;
      const words = plain(s.text);
      const key = entryKey(words);
      if (key && !entries.has(key)) entries.set(key, s.id);
      const letter = letterOf(words);
      if (letter && !firsts.has(letter)) firsts.set(letter, s.id);
    }
    let open = false;
    let html = lettersHtml(firsts, context);
    for (const s of segments) {
      const machine = s.origin && !s.origin.checked ? ' m' : '';
      if (s.kind === 'heading') {
        if (open) html += '</div>';
        const letter = letterOf(plain(s.text));
        html += `<div class="ix-e"${letter ? ` data-l="${letter}"` : ''}><p id="s-${escape(s.id)}" class="ix-h${machine}">${context.run(s.text ?? [])}</p>`;
        open = true;
        continue;
      }
      if (!s.text?.length) continue;
      const led = volumeLed(s.text);
      html += `<p id="s-${escape(s.id)}" class="${led ? 'ix-v' : 'ix-p'}${machine}">${placesHtml(s.text, led ?? context.volume ?? null, entries, context)}</p>`;
    }
    return open ? `${html}</div>` : html;
  },
};
