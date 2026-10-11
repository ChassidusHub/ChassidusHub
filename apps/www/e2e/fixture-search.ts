/**
 * The stand-in API's search (GET /v1/search/page and /v1/search/suggest) for
 * the browser tests: "פסקה" finds a few made-up things of every kind,
 * "תקלה" is a search that fails, and anything else finds nothing. Every word
 * is sample text written for the tests (לדוגמה).
 */
const sicha = { id: 'rh-aaaaaab1', type: 'unit', kind: 'sicha', title: 'שיחה ראשונה', sub: 'ספר לדוגמה · חלק א׳', path: '/sample/1/1', read: true };
const sefer = { id: 'rh-aaaaaaa2', type: 'work', kind: 'sefer', title: 'ספר לדוגמה', sub: 'מחבר לדוגמה', path: '/sample' };
const shelf = { id: 'rh-aaaaaaa1', type: 'set', kind: 'shelf', title: 'מדף לדוגמה', sub: '', path: '/sets/sample' };
const farbrengen = { id: 'rh-aaaaaae1', type: 'event', kind: 'farbrengen', title: 'התוועדות לדוגמה', sub: 'י״ט כסלו תשמ״ז', path: '/farbrengens/5747-03-19', listen: true };
const snippet = 'א. פסקה ראשונה לדוגמה, ובה מילה מודגשת';
const heard = 'ואז אמר פסקה שקראה מכונה לדוגמה';

export function searchAnswer(url: URL): [number, unknown] | undefined {
  const q = url.searchParams.get('q') ?? '';
  if (url.pathname === '/v1/search/suggest') return [200, { query: q, hits: q.startsWith('פס') ? [sicha, sefer, shelf] : [] }];
  if (url.pathname !== '/v1/search/page') return undefined;
  if (q === 'תקלה') return [500, { error: 'internal', message: 'sample failure' }];
  if (!q.startsWith('פסקה')) return [200, { query: q, date: null, within: null, top: null, works: [], events: [], words: [] }];
  return [
    200,
    {
      query: q,
      date: null,
      within: null,
      top: sicha,
      works: [sicha, sefer, shelf],
      events: [farbrengen],
      words: [
        { id: 'rh-aaaaaab1', kind: 'paragraph', title: 'שיחה ראשונה', sub: 'ספר לדוגמה · חלק א׳', path: '/sample/1/1#p1', snippet, marks: [[3, 7]], machine: false, opening: true },
        { id: 'rh-aaaaaae1', kind: 'paragraph', title: 'התוועדות לדוגמה', sub: 'י״ט כסלו תשמ״ז', path: '/farbrengens/5747-03-19?t=95', snippet: heard, marks: [[8, 12]], machine: true, opening: false },
      ],
    },
  ];
}
