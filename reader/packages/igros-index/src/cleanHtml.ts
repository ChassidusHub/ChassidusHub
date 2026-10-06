/**
 * The source stores each field as a fragment of editor HTML (`<p>`, `<b>`,
 * stray `<div>`s, empty paragraphs, inline styles). These two helpers keep
 * what reads as text and drop the rest, with no HTML parser dependency.
 */

const KEPT_TAGS = new Set(['p', 'b', 'strong', 'i', 'em', 'u', 'br', 'sup', 'sub']);
const BLOCK_TAGS = new Set(['div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']);

/**
 * Keeps paragraphs, bold/italic/underline, line breaks and super/subscript
 * without attributes; turns other block tags into paragraphs; unwraps every
 * other tag; removes scripts, styles, comments and empty paragraphs.
 */
export function cleanHtml(html: string | null | undefined): string {
  if (!html) return '';
  let out = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/\r\n?/g, '\n');
  out = out.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)\s*>/g, (_match, closing: string, rawName: string, selfClosing: string) => {
    const name = rawName.toLowerCase();
    if (name === 'br') return '<br>';
    if (KEPT_TAGS.has(name)) return `<${closing}${name === 'strong' ? 'b' : name === 'em' ? 'i' : name}>`;
    if (BLOCK_TAGS.has(name)) return selfClosing ? '' : `<${closing}p>`;
    return '';
  });
  out = out
    .replace(/[ \t\n]+/g, ' ')
    .replace(/<p>\s*<p>/g, '<p>')
    .replace(/<\/p>\s*<\/p>/g, '</p>')
    .replace(/<(b|i|u|sup|sub)>(\s|&nbsp;| )*<\/\1>/g, '$2')
    .replace(/<\/(b|i|u)><\1>/g, '')
    .replace(/<p>(?:\s|&nbsp;| |<br>)*<\/p>/g, '')
    .replace(/<p>\s+/g, '<p>')
    .replace(/\s+<\/p>/g, '</p>')
    .replace(/\s*<\/p>\s*<p>\s*/g, '</p><p>')
    .trim();
  return out;
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

/** Plain text: one line per paragraph, entities decoded, spaces collapsed. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
