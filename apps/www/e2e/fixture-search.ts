/**
 * The stand-in API's search (GET /v1/search/page and /v1/search/suggest) for
 * the browser tests: "פסקה" finds a few made-up things of every kind,
 * "piska" is a subject in English letters, "תקלה" is a search that fails,
 * "פסקה איטית" answers after 6 s (a cold search on a busy day), "פסקה פעם"
 * fails the first time it is asked and answers after, and anything else
 * finds nothing. Every word is sample text written for the
 * tests (לדוגמה).
 */
const sicha = { id: 'rh-aaaaaab1', type: 'unit', kind: 'sicha', title: 'שיחה ראשונה', sub: 'ספר לדוגמה · חלק א׳', path: '/sample/1/1', read: true };
const sefer = { id: 'rh-aaaaaaa2', type: 'work', kind: 'sefer', title: 'ספר לדוגמה', sub: 'מחבר לדוגמה', path: '/sample' };
const shelf = { id: 'rh-aaaaaaa1', type: 'set', kind: 'shelf', title: 'מדף לדוגמה', sub: '', path: '/sets/sample' };
const farbrengen = { id: 'rh-aaaaaae1', type: 'event', kind: 'farbrengen', title: 'התוועדות לדוגמה', sub: 'י״ט כסלו תשמ״ז', path: '/farbrengens/5747-03-19', listen: true };
const snippet = 'א. פסקה ראשונה לדוגמה, ובה מילה מודגשת';
const heard = 'ואז אמר פסקה שקראה מכונה לדוגמה';

/** How many times each search was asked, for the one that fails only the first time. */
const asked = new Map<string, number>();

/** The answer, and how long the stand-in API waits before giving it (ms). */
export function searchAnswer(url: URL): [number, unknown, number?] | undefined {
  const q = url.searchParams.get('q') ?? '';
  if (url.pathname === '/v1/search/page') asked.set(q, (asked.get(q) ?? 0) + 1);
  if (q === 'פסקה איטית') return [...(searchAnswer(new URL('/v1/search/page?q=' + encodeURIComponent('פסקה'), url)) as [number, unknown]), 6000];
  if (q === 'פסקה פעם' && asked.get(q) === 1) return [500, { error: 'internal', message: 'sample failure' }];
  if (url.pathname === '/v1/search/suggest') return [200, { query: q, hits: q.startsWith('פס') ? [sicha, sefer, shelf] : [] }];
  if (url.pathname !== '/v1/search/page') return undefined;
  if (q === 'תקלה') return [500, { error: 'internal', message: 'sample failure' }];
  // A subject typed in English letters is searched in Hebrew, and the page says so.
  if (q === 'piska') return [200, { query: q, date: null, within: null, topic: { key: 'piska', he: 'פסקה' }, top: sicha, works: [], events: [], words: [] }];
  if (!q.startsWith('פסקה')) return [200, { query: q, date: null, within: null, top: null, works: [], events: [], words: [] }];
  return [
    200,
    {
      query: q,
      date: null,
      within: null,
      top: sicha,
      subjects: [
        { index: { he: 'מפתח לדוגמה' }, topic: 'פסקה', places: 34, volumes: 12, machine: true, path: '/mafteach?q=%D7%A4%D7%A1%D7%A7%D7%94' },
        { index: null, topic: 'פסקה קטנה', places: 1, volumes: 1, machine: false, path: '/mafteach?q=%D7%A7%D7%98%D7%A0%D7%94' },
      ],
      works: [sicha, sefer, shelf],
      events: [farbrengen],
      words: [
        { id: 'rh-aaaaaab1', kind: 'paragraph', title: 'שיחה ראשונה', sub: 'ספר לדוגמה · חלק א׳', path: '/sample/1/1#p1', snippet, marks: [[3, 7]], machine: false, opening: true },
        { id: 'rh-aaaaaae1', kind: 'paragraph', title: 'התוועדות לדוגמה', sub: 'י״ט כסלו תשמ״ז', path: '/farbrengens/5747-03-19?t=95', snippet: heard, marks: [[8, 12]], machine: true, opening: false },
      ],
    },
  ];
}
