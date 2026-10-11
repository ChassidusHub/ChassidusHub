import type { ChassidusHub } from '@chassidushub/client';
import { KIND, type Hit, type SearchPage, type WordHit } from './names';

/**
 * The Search screen's reads: one for the results (GET /v1/search/page) and
 * one for the rows while typing (GET /v1/search/suggest). The API names
 * everything in Hebrew; here its hits only become the page's rows. `api` is
 * the loader's `context.api`.
 */

type Answer = Awaited<ReturnType<ChassidusHub['searchPage']>>;
type Found = NonNullable<Answer['top']>;
type Words = Answer['words'][number];

/** A thing found by its name, as a row; one with no page of its own is left out. */
function hitOf(found: Found): Hit | null {
  if (!found.path) return null;
  return {
    kind: KIND[found.kind] ?? '',
    // A farbrengen with no name of its own is its date.
    title: found.title || found.sub,
    sub: found.title ? found.sub : '',
    to: found.path,
    listen: found.listen ? found.path : undefined,
  };
}

/** A place in the words, as a row: the words around it, then what they are in. */
function wordHitOf(words: Words): WordHit {
  return {
    snippet: words.snippet,
    marks: words.marks,
    sub: [words.title, words.sub].filter(Boolean).join(' · '),
    to: words.path,
    machine: words.machine,
  };
}

const rows = (found: Found[]) => found.map(hitOf).filter((hit): hit is Hit => hit !== null);

/** The whole results page for one query. */
export async function searchPage(api: ChassidusHub, query: string): Promise<SearchPage> {
  const answer = await api.searchPage({ q: query }).catch(() => null);
  if (!answer) return { query, top: null, works: [], events: [], words: [], failed: true };
  const top = answer.top ? hitOf(answer.top) : null;
  const rest = (found: Found[]) => rows(found).filter((hit) => hit.to !== top?.to);
  return {
    query,
    topic: answer.topic?.he,
    top,
    works: rest(answer.works),
    events: rest(answer.events),
    words: answer.words.map(wordHitOf),
  };
}

/** A few rows while typing: names only, best first. */
export async function suggestions(api: ChassidusHub, query: string): Promise<Hit[]> {
  const answer = await api.searchSuggest({ q: query }).catch(() => null);
  return answer ? rows(answer.hits) : [];
}
