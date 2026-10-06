import { sefariaRefPath } from '@chassidushub-reader/works';

/** Sefaria's API addresses, apart from the client so the phone can use them without Node. */

export const SEFARIA_BASE_URL = 'https://www.sefaria.org';

const LANGUAGE_FAMILY = { he: 'hebrew', en: 'english' } as const;

export function indexUrl(title: string, baseUrl = SEFARIA_BASE_URL): string {
  return `${baseUrl}/api/v2/index/${sefariaRefPath(title)}?with_content_counts=1`;
}

export function textUrl(ref: string, language: 'he' | 'en', version: string, baseUrl = SEFARIA_BASE_URL): string {
  return `${baseUrl}/api/v3/texts/${sefariaRefPath(ref)}?version=${encodeURIComponent(`${LANGUAGE_FAMILY[language]}|${version}`)}`;
}
