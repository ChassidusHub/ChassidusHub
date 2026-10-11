/**
 * The repository's Markdown as HTML, drawn on the server for the developer
 * docs, so no Markdown reader is ever sent to the browser. Only what the docs
 * use: headings (with GitHub's anchors), paragraphs, lists nested by indent,
 * fenced code, tables, quotes, rules, and inline code, bold, italics and
 * links. Every character is escaped first, so a page holds only what these
 * rules make: raw HTML in a file shows as text.
 *
 * `link` decides where each link goes: a doc that is a page of the site
 * opens there, any other file of the repository on GitHub.
 */

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A heading's anchor as GitHub makes it: lower case, punctuation dropped, spaces as hyphens. */
export function anchorOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

type Link = (href: string) => string;

function inline(text: string, link: Link): string {
  // Code first, set aside, so nothing in it is read as Markdown.
  const codes: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_, code: string) => `\u0000${codes.push(`<code>${escapeHtml(code)}</code>`) - 1}\u0000`);
  out = escapeHtml(out);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    const to = link(href.replace(/&amp;/g, '&'));
    // Web addresses, mail and the site's own places only: never a script.
    const safe = /^[a-z][a-z0-9+.-]*:/i.test(to) && !/^(https?|mailto):/i.test(to) ? '#' : to;
    return `<a href="${escapeHtml(safe)}"${/^https?:\/\//.test(safe) ? ' rel="noopener"' : ''}>${label}</a>`;
  });
  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:]|$)/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, n: string) => codes[Number(n)]!);
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));

const ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const startsBlock = (line: string) => /^(#{1,6}\s|```|>\s?|([-*+]|\d+\.)\s|---+\s*$|\|)/.test(line);

/** Markdown to HTML, with its headings (for the page's contents) and its first heading as its title. */
export function renderMarkdown(source: string, link: Link = (href) => href, used = new Map<string, number>()): { html: string; headings: Heading[]; title: string | null } {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const headings: Heading[] = [];
  let title: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = /^```\s*([\w-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!);
      i++;
      out.push(`<pre><code${fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : ''}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const depth = heading[1]!.length;
      const text = heading[2]!.trim();
      const plain = text.replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      if (depth === 1 && title === null) title = plain;
      let id = anchorOf(plain);
      const seen = used.get(id) ?? 0;
      used.set(id, seen + 1);
      if (seen) id = `${id}-${seen}`;
      headings.push({ depth, text: plain, id });
      out.push(`<h${depth} id="${escapeHtml(id)}">${inline(text, link)}</h${depth}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) body.push(lines[i++]!.replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(body.join('\n'), link, used).html}</blockquote>`);
      continue;
    }
    if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(cells(lines[i++]!));
      out.push(
        `<div class="table-wrap" tabindex="0"><table><thead><tr>${head.map((h) => `<th>${inline(h, link)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((row) => `<tr>${head.map((_, n) => `<td>${inline(row[n] ?? '', link)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]!);
      const indent = item[1]!.length;
      const items: string[] = [];
      while (i < lines.length) {
        const current = ITEM.exec(lines[i]!);
        if (!current || current[1]!.length !== indent) break;
        const body = [current[3]!];
        i++;
        // The item's own continued lines, then whatever is indented under it (a nested list, code).
        while (i < lines.length && lines[i]!.trim() !== '' && !ITEM.test(lines[i]!) && !startsBlock(lines[i]!.trimStart())) body.push(lines[i++]!.trim());
        const nested: string[] = [];
        while (i < lines.length && (lines[i]!.trim() === '' ? /^\s{2,}\S/.test(lines[i + 1] ?? '') : lines[i]!.length - lines[i]!.trimStart().length > indent)) nested.push(lines[i++]!.slice(indent + 2));
        items.push(`<li>${inline(body.join(' '), link)}${nested.length ? renderMarkdown(nested.join('\n'), link, used).html : ''}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !(para.length && startsBlock(lines[i]!))) para.push(lines[i++]!.trim());
    out.push(`<p>${inline(para.join(' '), link)}</p>`);
  }
  return { html: out.join('\n'), headings, title };
}
