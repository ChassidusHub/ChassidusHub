import { isPageHref, type PageInline, type PageMark, type PageSegment } from '@chassidushub/model';

/**
 * A page's words drawn as HTML, once, on the server. The words come as
 * structure (packages/model pageText.ts), never as markup, so every run is
 * escaped here and only this small set of tags is ever written: paragraphs,
 * headings, the marks, footnote marks and links.
 *
 * Each segment keeps its id (`s-<id>`), so a link can point at it and a fix
 * knows where it is; words a machine made and nobody checked yet carry `m`,
 * the faint dotted underline. Footnote marks are links to the note at the
 * end of the page, so they work before any script has arrived; with script
 * a mark opens the note in a sheet.
 */

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const tags: Record<Exclude<PageMark, 'ois'>, string> = { b: 'b', i: 'i', u: 'u', small: 'small', sup: 'sup', sub: 'sub' };

/** The id a segment's element gets: safe in a URL fragment, as segment ids are (PAGE_ID_PATTERN). */
const sid = (id: string) => `s-${escape(id)}`;

/** How a note's mark reads: the source's own label (a star), its number, else its place among the notes. */
export function noteLabels(notes: readonly PageSegment[]): Map<string, string> {
  return new Map(notes.map((note, at) => [note.id, note.label ?? String(note.n ?? at + 1)]));
}

function run(inline: PageInline, labels: Map<string, string>): string {
  if ('note' in inline) {
    const label = labels.get(inline.note) ?? '*';
    return `<a class="nm" href="#n-${escape(inline.note)}" data-n="${escape(inline.note)}" aria-label="הערה ${escape(label)}">${escape(label)}</a>`;
  }
  if ('marker' in inline) return `<span class="mk">${escape(inline.marker)}</span>`;
  if ('br' in inline) return '<br>';
  if ('eol' in inline) return '';
  let html = escape(inline.text);
  for (const mark of inline.marks ?? []) {
    html = mark === 'ois' ? `<span class="ois">${html}</span>` : `<${tags[mark]}>${html}</${tags[mark]}>`;
  }
  if (inline.href && isPageHref(inline.href) && !inline.href.startsWith('rh-')) {
    const outside = inline.href.startsWith('http');
    html = `<a href="${escape(inline.href)}"${outside ? ' rel="noopener" target="_blank"' : ''}>${html}</a>`;
  }
  return html;
}

const runs = (text: readonly PageInline[] | undefined, labels: Map<string, string>) => (text ?? []).map((r) => run(r, labels)).join('');

/** Letters only, to tell whether a heading only repeats the page's title. */
const letters = (text: string) => text.replace(/[^א-תA-Za-z0-9]/g, '');
const plain = (text: readonly PageInline[] | undefined) => (text ?? []).map((r) => ('text' in r ? r.text : '')).join('');

function segment(s: PageSegment, labels: Map<string, string>, first: boolean, title: string): string {
  const classes: string[] = [];
  if (s.origin && !s.origin.checked) classes.push('m');
  if (s.end) classes.push('end');
  const words = runs(s.text, labels);
  if (s.kind === 'section') {
    const head = words ? `<p class="hd" id="${sid(s.id)}">${words}</p>` : '';
    return head + (s.children ?? []).map((child) => segment(child, labels, false, title)).join('');
  }
  if (s.kind === 'heading') {
    classes.unshift('hd');
    // The print's own title over the first paragraph, when the page's title already says it.
    if (first && title && letters(plain(s.text)) === letters(title)) classes.push('first');
  }
  if (!words) return '';
  return `<p id="${sid(s.id)}"${classes.length ? ` class="${classes.join(' ')}"` : ''}>${words}</p>`;
}

/** The body: every segment in reading order. `title` is the page's own title. */
export function wordsHtml(segments: readonly PageSegment[], notes: readonly PageSegment[], title: string): string {
  const labels = noteLabels(notes);
  return segments.map((s, at) => segment(s, labels, at === 0, title)).join('');
}

/** The notes, at the end of the page: each with its mark, its words, and a way back up to where it is marked. */
export function notesHtml(notes: readonly PageSegment[]): string {
  const labels = noteLabels(notes);
  return notes
    .map((note) => {
      const label = labels.get(note.id)!;
      const machine = note.origin && !note.origin.checked ? ' m' : '';
      const body = runs(note.text, labels) + (note.children ?? []).map((child) => ` ${runs(child.text, labels)}`).join('');
      return `<li id="n-${escape(note.id)}" class="fn${machine}"><span class="fl">${escape(label)}</span><span class="nt">${body}</span></li>`;
    })
    .join('');
}
