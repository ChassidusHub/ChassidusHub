import type { Edition } from './types.js';

/** Sefaria's page address for a ref: spaces become underscores, the rest is URL-encoded. */
export function sefariaRefPath(ref: string): string {
  return encodeURIComponent(ref.replace(/ /g, '_')).replace(/%2C/g, ',');
}

/**
 * Where a person reads an edition at its source, for the editions the phone
 * opens in a browser (a link-only copy, or "read it at the source"). Null
 * for the mafteiach and JEM files, which the apps already fetch themselves.
 */
export function editionUrl(edition: Pick<Edition, 'source' | 'sourceId' | 'language' | 'version'>): string | null {
  if (edition.source === 'sefaria') {
    const lang = edition.language === 'en' ? 'en' : 'he';
    const version = edition.version ? `v${lang}=${encodeURIComponent(edition.version.replace(/ /g, '_'))}&` : '';
    return `https://www.sefaria.org/${sefariaRefPath(edition.sourceId)}?${version}lang=${lang}`;
  }
  if (edition.source === 'hebrewbooks' && /^\d+$/.test(edition.sourceId)) return `https://hebrewbooks.org/${edition.sourceId}`;
  return null;
}
