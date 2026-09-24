import type { IgrosLetter, Maaneh } from './types.js';

/**
 * The text object for one letter or maaneh: a small, self-contained HTML
 * document fragment, the same bytes for the same record on every build, so
 * the archive stores each once (its sha256 is its identity) and a rebuild
 * with nothing changed adds nothing. The phone renders it as is.
 */
export const TEXT_OBJECT_MIME = 'text/html; charset=utf-8';

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;');
}

function block(tag: string, className: string, html: string): string {
  return html ? `<${tag} class="${className}">${html}</${tag}>` : '';
}

function line(className: string, text: string): string {
  return text ? `<p class="${className}">${escapeText(text)}</p>` : '';
}

export function letterHtml(letter: IgrosLetter): string {
  const header = [line('number', letter.numberLabel), line('date', letter.dateLine), line('city', letter.city)].join('');
  return (
    `<article dir="rtl" lang="he" data-id="${escapeAttribute(letter.id)}">` +
    (header ? `<header>${header}</header>` : '') +
    block('div', 'addressee', letter.addressee) +
    block('div', 'body', letter.body) +
    block('div', 'signature', letter.signature) +
    block('aside', 'notes', letter.notes) +
    `</article>\n`
  );
}

export function maanehHtml(maaneh: Maaneh): string {
  const header = [line('number', maaneh.numberLabel), line('date', maaneh.dateLine)].join('');
  return (
    `<article dir="rtl" lang="he" data-id="${escapeAttribute(maaneh.id)}">` +
    (header ? `<header>${header}</header>` : '') +
    block('div', 'body', maaneh.body) +
    `</article>\n`
  );
}
