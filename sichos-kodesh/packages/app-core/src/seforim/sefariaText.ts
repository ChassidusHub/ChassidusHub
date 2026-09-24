import type { CatalogEdition, CatalogUnit, CatalogWork } from '@sichos-kodesh/catalog';
import { renderUnit, textUrl, type SefariaTextResponse } from '@sichos-kodesh/sefaria-index/reader';

/**
 * A unit read live from Sefaria and rendered by the same code that made
 * the text packs, so it looks the same whether it came from a pack, a
 * saved copy or the network. Both apps read online this way.
 */

export type TextProblem = 'offline' | 'unavailable';

export class TextLoadError extends Error {
  constructor(readonly problem: TextProblem) {
    super(problem);
  }
}

/** Just what the text read needs of `fetch`. */
export type TextFetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export async function fetchFromSefaria(work: CatalogWork, unit: CatalogUnit, edition: CatalogEdition, fetchFn: TextFetch = fetch as TextFetch): Promise<string> {
  const source = work.sources[edition.source];
  if (!source || source.source !== 'sefaria' || !unit.ref || !source.version || (source.language !== 'he' && source.language !== 'en')) throw new TextLoadError('unavailable');
  let response: { ok: boolean; json(): Promise<unknown> };
  try {
    response = await fetchFn(textUrl(unit.ref, source.language, source.version));
  } catch {
    throw new TextLoadError('offline');
  }
  if (!response.ok) throw new TextLoadError('unavailable');
  const answer = (await response.json()) as SefariaTextResponse;
  const text = answer.versions?.[0]?.text;
  if (text === undefined) throw new TextLoadError('unavailable');
  const licence = source.licence as Parameters<typeof renderUnit>[0]['licence'];
  return renderUnit({
    workId: work.id,
    unitId: unit.id,
    heading: source.language === 'en' ? (unit.labelEn ?? unit.label) : unit.label,
    language: source.language,
    ref: unit.ref,
    version: source.version,
    licence,
    credit: source.credit,
    text,
    sectionNames: [],
  });
}
