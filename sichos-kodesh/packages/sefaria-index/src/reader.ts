/**
 * What a reader needs to show a Sefaria text as the import renders it, with
 * nothing that needs Node: the phone reads a unit online from Sefaria and
 * renders it to the same small HTML its text packs carry
 * (`@sichos-kodesh/sefaria-index/reader`).
 */
export { cleanSegment, type Note } from './clean.js';
export { hasText, renderUnit, sectionLabel, TEXT_OBJECT_MIME, type UnitText } from './render.js';
export { SEFARIA_BASE_URL, textUrl } from './urls.js';
export type { SefariaTextResponse, SefariaVersionText } from './types.js';
export { editionUrl } from '@sichos-kodesh/works';
