import type { CatalogEdition, CatalogUnit, CatalogWork } from '@sichos-kodesh/catalog';
import { CATALOG_API_BASE_URL } from '../catalog/catalogUpdate.js';
import { TextLoadError, fetchFromSefaria, type TextFetch } from './sefariaText.js';

/**
 * Reading a unit online, from wherever its edition is served:
 * - Sefaria's texts from Sefaria itself (`fetchFromSefaria`);
 * - the texts no other site serves - the Igros Kodesh - from the catalog
 *   API, each at its own sha256 (`/v3/texts/<sha256>`). The address is the
 *   text's identity, so it never serves anything else and any cache may
 *   keep it for good.
 */

export function hostedTextUrl(sha256: string, base: string = CATALOG_API_BASE_URL): string {
  return `${base}/v3/texts/${sha256}`;
}

/** The UTF-8 length of a string, to check a text against the bytes the catalog names. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** A hosted text object, checked against the length the catalog gives it. */
export async function fetchHostedText(edition: CatalogEdition, fetchFn: TextFetch = fetch as TextFetch, base?: string): Promise<string> {
  if (!edition.sha256) throw new TextLoadError('unavailable');
  let html: string;
  try {
    const response = await fetchFn(hostedTextUrl(edition.sha256, base));
    if (!response.ok) throw new TextLoadError('unavailable');
    html = await response.text();
  } catch (error) {
    throw error instanceof TextLoadError ? error : new TextLoadError('offline');
  }
  if (edition.bytes !== undefined && utf8Length(html) !== edition.bytes) throw new TextLoadError('unavailable');
  return html;
}

/** A unit's text in one edition, read online from where that edition is served. */
export function fetchUnitText(work: CatalogWork, unit: CatalogUnit, edition: CatalogEdition, fetchFn?: TextFetch): Promise<string> {
  if (work.sources[edition.source]?.source === 'sefaria') return fetchFromSefaria(work, unit, edition, fetchFn);
  return fetchHostedText(edition, fetchFn);
}
