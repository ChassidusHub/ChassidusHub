import { gematriya } from '@hebcal/core';
import { editionUrl, type Licence } from '@sichos-kodesh/works';
import { cleanSegment, type Note } from './clean.js';

/**
 * The text object for one unit in one edition: a small, self-contained HTML
 * fragment the phone renders as is. The same text gives the same bytes on
 * every import, so the archive stores it once (its sha256 is its identity)
 * and a re-import with nothing changed adds nothing. It carries its credit,
 * as the licences ask.
 */
export const TEXT_OBJECT_MIME = 'text/html; charset=utf-8';

const LICENCE_LABELS: Readonly<Record<Licence, string>> = {
  'facts-and-links': 'Facts and links',
  'public-domain': 'Public domain',
  cc0: 'CC0',
  'cc-by': 'CC BY',
  'cc-by-nc': 'CC BY-NC',
  'free-to-read': 'Free to read',
  'site-terms': "The site's terms",
  commercial: 'Commercial',
  unknown: 'Licence unknown',
};

export interface UnitText {
  workId: string;
  unitId: string;
  /** The unit's title in the edition's language. */
  heading: string;
  language: 'he' | 'en';
  /** The Sefaria ref and version, for the credit's link. */
  ref: string;
  version: string;
  licence: Licence;
  credit?: string;
  /** The unit's text: a list of segments, or of sections of segments when the unit is deeper. */
  text: unknown;
  /** Section names below the unit (Sefaria's, in the edition's language), for sub-headings. */
  sectionNames: readonly string[];
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;');
}

/** Whether a text (a segment or nested sections) has any words in it. */
export function hasText(text: unknown): boolean {
  if (typeof text === 'string') return text.replace(/<[^>]*>/g, '').trim().length > 0;
  return Array.isArray(text) && text.some(hasText);
}

export function sectionLabel(name: string | undefined, n: number, language: 'he' | 'en'): string {
  const number = language === 'he' ? gematriya(n) : String(n);
  return name ? `${name} ${number}` : number;
}

function body(text: unknown, names: readonly string[], language: 'he' | 'en', notes: Note[], level: number): string {
  if (typeof text === 'string') {
    const html = cleanSegment(text, notes);
    return html ? `<p>${html}</p>` : '';
  }
  if (!Array.isArray(text)) return '';
  const deeper = text.some(Array.isArray);
  return text
    .map((part, index) => {
      if (!deeper || !Array.isArray(part)) return body(part, names.slice(1), language, notes, level);
      const inner = body(part, names.slice(1), language, notes, level + 1);
      return inner ? `<h${level}>${escapeText(sectionLabel(names[0], index + 1, language))}</h${level}>${inner}` : '';
    })
    .join('');
}

export function renderUnit(unit: UnitText): string {
  const notes: Note[] = [];
  const main = body(unit.text, unit.sectionNames, unit.language, notes, 2);
  const noteList = notes.map((note, i) => `<p id="n${i + 1}"><a href="#r${i + 1}">${escapeText(note.marker)}</a> ${note.html}</p>`).join('');
  const url = editionUrl({ source: 'sefaria', sourceId: unit.ref, language: unit.language, version: unit.version }) ?? 'https://www.sefaria.org';
  const credit =
    `<footer class="source">` +
    `<span class="version">${escapeText(unit.credit ?? unit.version)}</span> · ` +
    `<span class="licence">${escapeText(LICENCE_LABELS[unit.licence])}</span> · ` +
    `<a href="${escapeAttribute(url)}">Sefaria</a>` +
    `</footer>`;
  return (
    `<article dir="${unit.language === 'he' ? 'rtl' : 'ltr'}" lang="${unit.language}" data-work="${escapeAttribute(unit.workId)}" data-unit="${escapeAttribute(unit.unitId)}" data-source="sefaria" data-version="${escapeAttribute(unit.version)}">` +
    `<h1>${escapeText(unit.heading)}</h1>` +
    main +
    (noteList ? `<aside class="notes">${noteList}</aside>` : '') +
    credit +
    `</article>\n`
  );
}
