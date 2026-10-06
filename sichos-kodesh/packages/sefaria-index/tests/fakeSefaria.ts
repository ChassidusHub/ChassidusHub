import { indexUrl, textUrl } from '../src/client.js';
import type { SefariaIndex, SefariaTextResponse } from '../src/types.js';

/**
 * A made-up Sefaria for the tests. It has a small "Tanya" shaped like the
 * real one:
 * - a part with a one-level title page, an approbation and a default node
 *   of chapters;
 * - a part named only by its `titles`;
 * - a node named only by a shared term, the way Torah Ohr's parshiyos are.
 * It also has a companion text ("Sources on Tanya"). It answers by URL,
 * the way the real API does, and counts what it is asked.
 */

export const KEHOT = 'Kehot Publication Society';
export const COMMUNITY = 'Sefaria Community Translation';
export const OTHER = 'Some Translation';

const chapters = { depth: 2, sectionNames: ['Chapter', 'Paragraph'], heSectionNames: ['פרק', 'פסקה'] };

export const TANYA_INDEX: SefariaIndex = {
  title: 'Tanya',
  heTitle: 'תניא',
  schema: {
    nodeType: 'SchemaNode',
    title: 'Tanya',
    heTitle: 'תניא',
    key: 'Tanya',
    nodes: [
      {
        nodeType: 'SchemaNode',
        title: 'Part I; Likkutei Amarim',
        heTitle: 'ליקוטי אמרים',
        key: 'part1',
        nodes: [
          { nodeType: 'JaggedArrayNode', title: 'Title Page', heTitle: 'שער', key: 'Title Page', depth: 1, sectionNames: ['Paragraph'], heSectionNames: ['פסקה'] },
          { nodeType: 'JaggedArrayNode', title: 'Approbation', heTitle: 'הסכמות', key: 'Approbation', ...chapters, content_counts: [2, 1] },
          { nodeType: 'JaggedArrayNode', key: 'default', default: true, ...chapters, content_counts: [2, 0, 1] },
        ],
      },
      {
        nodeType: 'JaggedArrayNode',
        titles: [
          { text: 'Part III; Iggeret HaTeshuvah', lang: 'en', primary: true },
          { text: 'אגרת התשובה', lang: 'he', primary: true },
        ],
        key: 'letter1',
        depth: 2,
        sectionNames: ['Chapter', 'Paragraph'],
        content_counts: [1],
      },
      { nodeType: null, sharedTitle: 'Noach', key: 'Noach', depth: 1, sectionNames: ['Paragraph'] },
    ],
  },
};

export const SOURCES_INDEX: SefariaIndex = {
  title: 'Sources on Tanya',
  heTitle: 'מקורות על תניא',
  schema: { nodeType: 'JaggedArrayNode', title: 'Sources on Tanya', heTitle: 'מקורות על תניא', key: 'Sources on Tanya', ...chapters },
};

const version = (versionTitle: string, license: string, text: unknown): SefariaTextResponse => ({ versions: [{ versionTitle, license, text }] });
const missing: SefariaTextResponse = { versions: [], warnings: [{ code: 101 }] };

const TEXTS: Record<string, Partial<Record<string, SefariaTextResponse>>> = {
  'Tanya, Part I; Likkutei Amarim, Title Page': { [KEHOT]: version(KEHOT, 'CC-BY-NC', ['<b>ספר</b> ליקוטי אמרים', '']) },
  'Tanya, Part I; Likkutei Amarim, Approbation': { [KEHOT]: version(KEHOT, 'CC-BY-NC', [['a1', 'a2'], ['b1']]) },
  'Tanya, Part I; Likkutei Amarim': {
    [KEHOT]: version(KEHOT, 'CC-BY-NC', [['<i data-overlay="Vilna Pages" data-value="[מ: כד כסלו]"></i> c1<sup class="footnote-marker">1</sup><i class="footnote">note <i>one</i></i>', 'c2'], [], ['c3']]),
    [COMMUNITY]: version(COMMUNITY, 'CC0', [['e1'], [], []]),
  },
  // Too big to serve whole: the importer asks for its sections one by one.
  'Tanya, Part III; Iggeret HaTeshuvah': { [KEHOT]: { error: 'too large' } },
  'Tanya, Part III; Iggeret HaTeshuvah 1': { [KEHOT]: version(KEHOT, 'CC-BY-NC', ['t1']) },
  'Tanya, Noach': { [OTHER]: version(OTHER, 'unknown', ['x']) },
  'Sources on Tanya': { [KEHOT]: version(KEHOT, 'CC-BY-NC', [['s1']]) },
};

export interface FakeSefaria {
  fetchFn: typeof fetch;
  urls: string[];
  /** Replace a version's answer for a ref. */
  set(ref: string, versionTitle: string, answer: SefariaTextResponse): void;
}

export function fakeSefaria(): FakeSefaria {
  const texts = structuredClone(TEXTS);
  const answers = new Map<string, unknown>([
    [indexUrl('Tanya'), TANYA_INDEX],
    [indexUrl('Sources on Tanya'), SOURCES_INDEX],
  ]);
  const urls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    let body = answers.get(url);
    if (body === undefined) {
      for (const [ref, versions] of Object.entries(texts)) {
        for (const language of ['he', 'en'] as const) {
          for (const title of [KEHOT, COMMUNITY, OTHER]) {
            if (textUrl(ref, language, title) === url) body = versions[title] ?? missing;
          }
        }
      }
    }
    if (body === undefined) return new Response('{"error":"unknown"}', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return {
    fetchFn,
    urls,
    set(ref, versionTitle, answer) {
      texts[ref] = { ...texts[ref], [versionTitle]: answer };
    },
  };
}
