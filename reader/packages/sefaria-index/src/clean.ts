/**
 * Sefaria's segments are small HTML fragments. The Chabad texts use a
 * handful of tags:
 * - bold and italic;
 * - `<br>` and `<small>`;
 * - page and study-schedule markers,
 *   `<i data-overlay="Vilna Pages" data-value="[מ: כד כסלו]"></i>`;
 * - footnotes: `<sup class="footnote-marker">1</sup>` followed by
 *   `<i class="footnote">…</i>`, which can nest more italics.
 *
 * `cleanSegment` keeps the text and those, as a small fixed set of tags
 * without Sefaria's attributes:
 * - a marker becomes `<span class="mark">`;
 * - a footnote moves to the unit's notes and leaves a numbered link in the
 *   text;
 * - every other tag is unwrapped;
 * - scripts and comments go.
 */

export interface Note {
  /** What the text shows: Sefaria's marker (`1`, `*`). */
  marker: string;
  html: string;
}

const INLINE: Readonly<Record<string, string>> = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', small: 'small', sup: 'sup', sub: 'sub' };
const DROPPED = new Set(['script', 'style']);

interface Token {
  kind: 'text' | 'open' | 'close' | 'comment';
  raw: string;
  name?: string;
  attrs?: Record<string, string>;
  selfClosing?: boolean;
}

const TOKEN = /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?\/?>|[^<]+|</g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  for (const match of html.matchAll(TOKEN)) {
    const raw = match[0];
    if (raw.startsWith('<!--')) tokens.push({ kind: 'comment', raw });
    else if (raw === '<' || !raw.startsWith('<')) tokens.push({ kind: 'text', raw });
    else if (raw.startsWith('</')) tokens.push({ kind: 'close', raw, name: raw.slice(2, -1).trim().toLowerCase() });
    else {
      const body = raw.slice(1, raw.endsWith('/>') ? -2 : -1);
      const name = /^[a-zA-Z][a-zA-Z0-9]*/.exec(body)![0].toLowerCase();
      const attrs: Record<string, string> = {};
      for (const attr of body.slice(name.length).matchAll(ATTR)) attrs[attr[1]!.toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? '';
      tokens.push({ kind: 'open', raw, name, attrs, selfClosing: raw.endsWith('/>') });
    }
  }
  return tokens;
}

/** The index just past the element opened at `start`, counting nested tags of the same name. */
function elementEnd(tokens: readonly Token[], start: number): number {
  const name = tokens[start]!.name;
  if (tokens[start]!.selfClosing) return start + 1;
  let depth = 0;
  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.name !== name) continue;
    if (token.kind === 'open' && !token.selfClosing) depth += 1;
    else if (token.kind === 'close') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return tokens.length;
}

function hasClass(token: Token, className: string): boolean {
  return (token.attrs?.class ?? '').split(/\s+/).includes(className);
}

function escapeText(text: string): string {
  return text.replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#[0-9]+;|#x[0-9a-fA-F]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function innerText(tokens: readonly Token[]): string {
  return tokens
    .filter((t) => t.kind === 'text')
    .map((t) => t.raw)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function tidy(html: string): string {
  let out = html.replace(/\s+/g, ' ');
  // Empty inline pairs, repeatedly (<b><i> </i></b>).
  for (let before = ''; before !== out; ) {
    before = out;
    out = out.replace(/<(b|i|u|small|sup|sub)>(\s*)<\/\1>/g, '$2');
  }
  return out.replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
}

function render(tokens: readonly Token[], notes: Note[] | null): string {
  let out = '';
  const open: string[] = [];
  let pendingMarker: string | null = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.kind === 'comment') continue;
    if (token.kind === 'text') {
      out += escapeText(token.raw);
      continue;
    }
    const name = token.name!;
    if (token.kind === 'close') {
      const tag = INLINE[name];
      const at = tag ? open.lastIndexOf(tag) : -1;
      if (at < 0) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    if (name === 'br') {
      out += '<br>';
      continue;
    }
    const end = elementEnd(tokens, i);
    if (DROPPED.has(name)) {
      i = end - 1;
      continue;
    }
    if (token.attrs?.['data-overlay'] !== undefined) {
      const value = (token.attrs['data-value'] ?? '').trim();
      if (value) out += `<span class="mark">${escapeText(value)}</span>`;
      i = end - 1;
      continue;
    }
    if (name === 'sup' && hasClass(token, 'footnote-marker')) {
      const marker = innerText(tokens.slice(i + 1, end - 1));
      let next = end;
      while (next < tokens.length && tokens[next]!.kind === 'text' && !tokens[next]!.raw.trim()) next += 1;
      if (notes && tokens[next]?.kind === 'open' && hasClass(tokens[next]!, 'footnote')) pendingMarker = marker || '*';
      else if (marker) out += `<sup>${escapeText(marker)}</sup>`;
      i = end - 1;
      continue;
    }
    if (hasClass(token, 'footnote')) {
      if (notes) {
        const html = tidy(render(tokens.slice(i + 1, end - 1), null));
        if (html) {
          notes.push({ marker: pendingMarker ?? '*', html });
          const n = notes.length;
          out += `<sup class="fn"><a href="#n${n}" id="r${n}">${escapeText(notes[n - 1]!.marker)}</a></sup>`;
        }
      }
      pendingMarker = null;
      i = end - 1;
      continue;
    }
    const tag = INLINE[name];
    if (tag && !token.selfClosing) {
      open.push(tag);
      out += `<${tag}>`;
    }
    // Any other tag (span, big, a, div, p) is unwrapped: its content stays.
  }
  while (open.length > 0) out += `</${open.pop()}>`;
  return out;
}

/**
 * One segment as clean inline HTML. Its footnotes are appended to `notes`,
 * numbered across the unit, and linked from the text (`#n3`, back `#r3`).
 */
export function cleanSegment(html: string, notes: Note[]): string {
  return tidy(render(tokenize(html), notes));
}
