/**
 * A text object - one unit of a sefer in one edition, the small HTML
 * fragment packages/sefaria-index renders (and the text packs carry) -
 * read into blocks the reader draws with React Native's own <Text>, so no
 * web view is needed. The fragment uses a fixed handful of tags:
 *
 *   <article dir lang data-...>   <h1>/<h2>/<h3>   <p>   <b> <i> <small> <sup>
 *   <span class="mark">           a page or daily-study marker
 *   <sup class="fn"><a href="#nN">marker</a></sup>   a footnote reference
 *   <aside class="notes"><p id="nN">...</p></aside>   the footnotes
 *   <footer class="source">...</footer>              the credit line
 *   <p class="end">                                  a line set to the end side (a letter's date, its signature)
 *
 * A letter of the Igros (`data-id="igros:..."`) is laid out as the Igros
 * app shows it (`layoutLetter`): its date line and city at the start, the
 * addressee small at the end side, the greeting at the start, the
 * signature at the end side.
 *
 * Anything else is read as its text. A note need not be pointed to from
 * the text: the Igros' notes on a letter stand after it with no mark in the
 * letter (see `notesAfterText`).
 */

export interface Inline {
  kind: 'text' | 'mark' | 'note' | 'break';
  text: string;
  bold?: boolean;
  italic?: boolean;
  small?: boolean;
  sup?: boolean;
  /** `note`: the footnote's number within the unit (its `nN`). */
  note?: number;
}

/** The part of a letter's head or foot a paragraph is (see `layoutLetter`). */
export type LetterRole = 'dateline' | 'place' | 'addressee' | 'greeting' | 'signature';

export interface Block {
  kind: 'heading' | 'paragraph';
  level?: number;
  /** `end`: set to the line's end side, as a letter's signature is. */
  align?: 'end';
  /** In a letter: which part of its head or foot this is. */
  role?: LetterRole;
  inlines: Inline[];
}

export interface Footnote {
  n: number;
  marker: string;
  inlines: Inline[];
}

export interface TextObject {
  /** The article's `data-id`, when it has one: `igros:41`. */
  id?: string;
  dir: 'rtl' | 'ltr';
  lang: string;
  heading: string | null;
  blocks: Block[];
  notes: Footnote[];
  /** The credit line, as plain text. */
  source: string | null;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

interface Tag {
  closing: boolean;
  name: string;
  attrs: Record<string, string>;
}

const TOKEN = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?\/?>|[^<]+|</g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;

function tagOf(raw: string): Tag | null {
  if (!raw.startsWith('<') || raw === '<') return null;
  const closing = raw.startsWith('</');
  const body = raw.slice(closing ? 2 : 1, raw.endsWith('/>') ? -2 : -1).trim();
  const name = (/^[a-zA-Z][a-zA-Z0-9]*/.exec(body)?.[0] ?? '').toLowerCase();
  const attrs: Record<string, string> = {};
  for (const match of body.slice(name.length).matchAll(ATTR)) attrs[match[1]!.toLowerCase()] = decodeEntities(match[2]!);
  return { closing, name, attrs };
}

interface Style {
  bold: boolean;
  italic: boolean;
  small: boolean;
  sup: boolean;
}

/** Merges neighbouring text runs of the same style, and trims the block's ends. */
function tidy(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const inline of inlines) {
    const last = out[out.length - 1];
    if (inline.kind === 'text' && last?.kind === 'text' && !!last.bold === !!inline.bold && !!last.italic === !!inline.italic && !!last.small === !!inline.small && !!last.sup === !!inline.sup) {
      last.text += inline.text;
    } else out.push({ ...inline });
  }
  for (const inline of out) if (inline.kind === 'text') inline.text = inline.text.replace(/\s+/g, ' ');
  const first = out[0];
  if (first?.kind === 'text') first.text = first.text.replace(/^\s+/, '');
  const last = out[out.length - 1];
  if (last?.kind === 'text') last.text = last.text.replace(/\s+$/, '');
  return out.filter((inline) => inline.kind !== 'text' || inline.text.length > 0);
}

export function parseTextObject(html: string): TextObject {
  const result: TextObject = { dir: 'rtl', lang: 'he', heading: null, blocks: [], notes: [], source: null };
  const style: Style = { bold: false, italic: false, small: false, sup: false };
  const styleStack: Array<keyof Style> = [];
  let current: Inline[] | null = null;
  let currentBlock: Block | null = null;
  let currentNote: Footnote | null = null;
  let inNotes = false;
  let inSource = false;
  let sourceText = '';
  let mark: string | null = null;
  let noteRef: { n: number; marker: string } | null = null;

  const push = (inline: Inline) => {
    if (!current) {
      // Text outside any block starts a paragraph of its own.
      if (inline.kind === 'text' && !inline.text.trim()) return;
      currentBlock = { kind: 'paragraph', inlines: [] };
      current = currentBlock.inlines;
    }
    current.push(inline);
  };
  const closeBlock = () => {
    if (currentBlock) {
      currentBlock.inlines = tidy(currentBlock.inlines);
      if (currentBlock.inlines.length > 0) {
        if (currentBlock.kind === 'heading' && currentBlock.level === 1 && result.heading === null) result.heading = currentBlock.inlines.map((i) => i.text).join('');
        else result.blocks.push(currentBlock);
      }
    }
    if (currentNote) {
      currentNote.inlines = tidy(currentNote.inlines);
      result.notes.push(currentNote);
    }
    currentBlock = null;
    currentNote = null;
    current = null;
  };

  for (const match of html.matchAll(TOKEN)) {
    const raw = match[0];
    const tag = tagOf(raw);
    if (!tag) {
      const text = decodeEntities(raw);
      if (inSource) sourceText += text;
      else if (mark !== null) mark += text;
      else if (noteRef) noteRef.marker += text;
      else push({ kind: 'text', text, ...(style.bold ? { bold: true } : {}), ...(style.italic ? { italic: true } : {}), ...(style.small ? { small: true } : {}), ...(style.sup ? { sup: true } : {}) });
      continue;
    }
    const { name, closing, attrs } = tag;
    if (name === 'article' && !closing) {
      if (attrs.dir === 'ltr' || attrs.dir === 'rtl') result.dir = attrs.dir;
      if (attrs.lang) result.lang = attrs.lang;
      if (attrs['data-id']) result.id = attrs['data-id'];
      continue;
    }
    if (name === 'footer') {
      inSource = !closing;
      continue;
    }
    if (inSource) continue;
    if (name === 'aside') {
      closeBlock();
      inNotes = !closing;
      continue;
    }
    if (/^h[1-6]$/.test(name) || name === 'p') {
      closeBlock();
      if (closing) continue;
      if (inNotes && name === 'p') {
        const n = Number(/^n(\d+)$/.exec(attrs.id ?? '')?.[1] ?? result.notes.length + 1);
        currentNote = { n, marker: '', inlines: [] };
        current = currentNote.inlines;
      } else {
        currentBlock = name === 'p' ? { kind: 'paragraph', inlines: [] } : { kind: 'heading', level: Number(name[1]), inlines: [] };
        if ((attrs.class ?? '').split(/\s+/).includes('end')) currentBlock.align = 'end';
        current = currentBlock.inlines;
      }
      continue;
    }
    if (name === 'br') {
      push({ kind: 'break', text: '\n' });
      continue;
    }
    if (name === 'span' && (attrs.class ?? '').split(/\s+/).includes('mark')) {
      mark = '';
      continue;
    }
    if (name === 'span' && closing && mark !== null) {
      if (mark.trim()) push({ kind: 'mark', text: mark.trim() });
      mark = null;
      continue;
    }
    if (name === 'a') {
      const target = /^#n(\d+)$/.exec(attrs.href ?? '');
      const backLink = /^#r(\d+)$/.exec(attrs.href ?? '');
      if (!closing && target && !inNotes) noteRef = { n: Number(target[1]), marker: '' };
      else if (!closing && backLink && inNotes && currentNote) {
        // The note's own link back to the text carries its marker.
        noteRef = { n: currentNote.n, marker: '' };
      } else if (closing && noteRef) {
        if (inNotes && currentNote) currentNote.marker = noteRef.marker.trim();
        else push({ kind: 'note', text: noteRef.marker.trim() || '*', note: noteRef.n });
        noteRef = null;
      }
      continue;
    }
    const flag = name === 'b' || name === 'strong' ? 'bold' : name === 'i' || name === 'em' ? 'italic' : name === 'small' ? 'small' : name === 'sup' ? 'sup' : null;
    if (!flag) continue;
    // A footnote's <sup class="fn"> wraps only its link: the link carries it.
    if (flag === 'sup' && (attrs.class ?? '').split(/\s+/).includes('fn')) continue;
    if (!closing) {
      styleStack.push(flag);
      style[flag] = true;
    } else {
      const at = styleStack.lastIndexOf(flag);
      if (at >= 0) {
        styleStack.splice(at, 1);
        style[flag] = styleStack.includes(flag);
      }
    }
  }
  closeBlock();
  result.source = sourceText.replace(/\s+/g, ' ').trim() || null;
  return result.id?.startsWith('igros:') ? layoutLetter(result) : result;
}

/** A letter's greeting: a short line of its own, שלום וברכה!, ברכה ושלום, or the English letters' Greeting and Blessing. */
const GREETING = /^(שלום|שלו׳|שלו'|ברכה|ש"ו|שו"ב|שו״ב|greeting|sholom|shalom)/i;
const GREETING_MAX = 32;

function blockText(block: Block): string {
  return block.inlines
    .map((inline) => inline.text)
    .join('')
    .replace(/[\u0591-\u05C7]/g, '')
    .trim();
}

/**
 * A letter laid out as the Igros app shows it: at the top, the date line
 * (ב"ה, the date) at the start side and the city under it, smaller; then
 * the addressee, small, in a narrow block at the end side; the greeting at
 * the start side after a gap; the body; and the signature at the end side.
 * The date line, city and signature arrive marked for the end side
 * (packages/igros-index) and are given their places here by role; the
 * addressee and the greeting are found by their place - what stands between
 * the city and a short greeting line among the first few paragraphs. A
 * letter with no such greeting keeps its other paragraphs as they are.
 */
export function layoutLetter(text: TextObject): TextObject {
  const blocks: Block[] = text.blocks.map((block) => ({ ...block }));
  let first = 0;
  while (first < blocks.length && blocks[first]!.align === 'end') {
    const block = blocks[first]!;
    block.role = first === 0 ? 'dateline' : 'place';
    delete block.align;
    first++;
  }
  let last = blocks.length - 1;
  while (last >= first && blocks[last]!.align === 'end') {
    blocks[last]!.role = 'signature';
    last--;
  }
  for (let i = first; i <= Math.min(last, first + 3); i++) {
    const block = blocks[i]!;
    const words = blockText(block);
    if (block.kind !== 'paragraph' || words.length > GREETING_MAX || !GREETING.test(words)) continue;
    block.role = 'greeting';
    for (let a = first; a < i; a++) blocks[a]!.role = 'addressee';
    break;
  }
  return { ...text, blocks };
}

/** The notes the text points to, by number. */
export function referencedNotes(text: TextObject): Set<number> {
  const found = new Set<number>();
  for (const block of text.blocks) for (const inline of block.inlines) if (inline.kind === 'note' && inline.note !== undefined) found.add(inline.note);
  return found;
}

/**
 * The notes the reader lists after the text: all of them when the notes go
 * at the end; in the text, only those nothing points to, which have no
 * other place to be shown.
 */
export function notesAfterText(text: TextObject, place: 'end' | 'inline'): Footnote[] {
  if (place === 'end') return text.notes;
  const referenced = referencedNotes(text);
  return text.notes.filter((note) => !referenced.has(note.n));
}

/** What a note is labelled with: its own marker, its number when the text points to it, or nothing (a note on the whole text). */
export function noteLabel(note: Footnote, referenced: ReadonlySet<number>): string {
  return note.marker || (referenced.has(note.n) ? String(note.n) : '');
}

/**
 * Hebrew vowel points and cantillation marks (U+0591 to U+05C7), without the
 * maqaf and sof pasuq, which read as punctuation. For the reader's "vowels
 * off": the letters stay exactly as they are.
 */
const NIQQUD = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

export function stripNiqqud(text: string): string {
  return text.replace(NIQQUD, '');
}

/** A page or study marker as the reader shows it: in brackets, once (Sefaria's markers often carry their own). */
export function markLabel(text: string): string {
  const trimmed = text.trim();
  return /^\[.*\]$/.test(trimmed) ? trimmed : `[${trimmed}]`;
}

/** The words of a text object, for a search result's snippet: paragraphs and notes, no heading or credit. */
export function textObjectPlainText(html: string): string {
  const parsed = parseTextObject(html);
  const lines = [...parsed.blocks.map((b) => b.inlines), ...parsed.notes.map((n) => n.inlines)].map((inlines) =>
    inlines
      .filter((i) => i.kind === 'text')
      .map((i) => i.text)
      .join(''),
  );
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}
