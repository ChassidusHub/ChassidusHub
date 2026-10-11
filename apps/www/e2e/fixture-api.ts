import { createServer } from 'node:http';
import { listenAnswer, paragraphWords } from './fixture-listen';

/**
 * A stand-in for the ChassidusHub API in the browser tests: GET /v1/view for
 * a few made-up pages, so the reading page is tested without a database,
 * and listening's reads (fixture-listen.ts), and POST /v1/fix as a signed-in
 * reader (the cookie rh_session=sample) or a signed-out one.
 * Every word here is sample text written for the tests (לדוגמה), never a
 * sefer's own words. `FIXTURE_PORT` picks the port (default 3002).
 */
const name = (he: string) => ({ he });
const bar = (unit: 1 | 2) => [
  { kind: 'set', chosen: { id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }, choices: [{ id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }] },
  { kind: 'work', chosen: { id: 'rh-aaaaaaa2', path: '/sample', name: name('ספר לדוגמה') }, choices: [{ id: 'rh-aaaaaaa2', path: '/sample', name: name('ספר לדוגמה') }] },
  { kind: 'part', level: 'volume', chosen: { path: '/sample/1', name: name('חלק א׳'), value: '1' }, choices: [{ path: '/sample/1', name: name('חלק א׳'), value: '1' }] },
  {
    kind: 'unit',
    level: 'sicha',
    chosen: { id: `rh-aaaaaab${unit}`, path: `/sample/1/${unit}`, name: name(unit === 1 ? 'שיחה ראשונה' : 'שיחה שניה') },
    choices: [
      { id: 'rh-aaaaaab1', path: '/sample/1/1', name: name('שיחה ראשונה') },
      { id: 'rh-aaaaaab2', path: '/sample/1/2', name: name('שיחה שניה') },
    ],
  },
];
const words = (text: string) => [{ text }];
const machine = { by: 'ocr', model: 'sample', checked: false };

const views: Record<string, unknown> = {
  '/sample/1/1': {
    item: { id: 'rh-aaaaaab1', type: 'unit', path: '/sample/1/1', rev: 1, data: { label: name('שיחה ראשונה') } },
    pathBar: bar(1),
    previous: null,
    next: { id: 'rh-aaaaaab2', path: '/sample/1/2', name: name('שיחה שניה') },
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'sichos-kodesh',
      segments: [
        { id: 'h1', kind: 'heading', text: words('שיחה ראשונה') },
        { id: 'p1', kind: 'paragraph', text: [{ text: 'א.', marks: ['ois'] }, { text: ' פסקה ראשונה לדוגמה, ובה ' }, { text: 'מילה מודגשת', marks: ['b'] }, { text: ' והערה' }, { note: 'n1' }, { text: '.' }] },
        { id: 'p2', kind: 'paragraph', text: [{ text: 'פסקה שניה לדוגמה, עם הערה נוספת' }, { note: 'n2' }, { text: ' ועוד כמה מילים.' }] },
        { id: 'p3', kind: 'paragraph', end: true, text: words('חתימה לדוגמה') },
      ],
      notes: [
        { id: 'n1', kind: 'note', n: 1, text: words('הערה ראשונה לדוגמה.') },
        { id: 'n2', kind: 'note', n: 2, text: words('הערה שניה לדוגמה.') },
      ],
      machine: 'none',
      versions: [
        { version: 'he', from: 'body', language: 'he' },
        { version: 'en', from: 'body', language: 'en' },
      ],
    },
  },
  '/sample/1/2': {
    item: { id: 'rh-aaaaaab2', type: 'unit', path: '/sample/1/2', rev: 1, data: { label: name('שיחה שניה') } },
    pathBar: bar(2),
    previous: { id: 'rh-aaaaaab1', path: '/sample/1/1', name: name('שיחה ראשונה') },
    next: null,
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'sichos-kodesh',
      segments: [
        { id: 'p1', kind: 'paragraph', text: words('פסקה שקראה מכונה לדוגמה, ועוד לא נבדקה בידי אדם.'), origin: machine },
        { id: 'p2', kind: 'paragraph', text: words('עוד פסקה שקראה מכונה לדוגמה.'), origin: machine },
      ],
      notes: [],
      machine: 'all',
      versions: [{ version: 'he', from: 'body', language: 'he' }],
    },
  },
  '/sample/1/3': {
    item: { id: 'rh-aaaaaab3', type: 'unit', path: '/sample/1/3', rev: 1, data: { label: name('שיחה שלישית') } },
    pathBar: bar(2),
    previous: { id: 'rh-aaaaaab2', path: '/sample/1/2', name: name('שיחה שניה') },
    next: null,
    text: null,
  },
};

/** The fixes sent, newest last, for the tests to read back (GET /_fixes). The pages' words never change. */
const fixes: unknown[] = [];
/** The same for what was saved in Edit (GET /_edits). */
const edits: unknown[] = [];

const plain = (runs: unknown) => (Array.isArray(runs) ? runs.map((r: { text?: string }) => r.text ?? '').join('') : String(runs));

/** POST /v1/fix as the API answers it: signed in by the sample cookie, live when a few words changed, 409 when the words moved. */
function fix(body: { item?: string; segment?: string; before?: unknown; after?: unknown }, cookie: string): [number, unknown] {
  if (!/(?:^|; )rh_session=sample(?:;|$)/.test(cookie)) return [401, { error: 'unauthorized', message: 'sign in first' }];
  const view = Object.values(views).find((v) => (v as { item: { id: string } }).item.id === body.item) as { text: { segments: { id: string; text: unknown }[]; notes: { id: string; text: unknown }[] } } | undefined;
  const heard = paragraphWords(body.item ?? '', body.segment ?? '');
  const segment = heard !== undefined ? { text: heard } : view && [...view.text.segments, ...view.text.notes].find((s) => s.id === body.segment);
  if (!segment || JSON.stringify(segment.text) !== JSON.stringify(body.before)) return [409, { error: 'conflict', message: 'the words changed' }];
  fixes.push(body);
  const changed = plain(body.after).split(' ').filter((w, i) => w !== plain(body.before).split(' ')[i]).length;
  return [201, changed <= 5 ? { changeset: 100 + fixes.length, live: true, undo: `/v1/fix/${100 + fixes.length}/undo` } : { changeset: 100 + fixes.length, live: false, reason: 'more than 5 words changed; a reviewer looks first' }];
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const cookie = req.headers.cookie ?? '';
      const [status, answer] =
        url.pathname === '/v1/fix'
          ? fix(JSON.parse(raw || '{}'), cookie)
          : url.pathname === '/v1/organize'
            ? cookie.includes('rh_session=sample') ? (edits.push(JSON.parse(raw || '{}')), [201, { suggestion: { id: 200 + edits.length, status: 'open', title: 'edit' }, merged: false, mayApprove: false, preview: {} }]) : [401, { error: 'unauthorized', message: 'sign in first' }]
          : /^\/v1\/fix\/\d+\/undo$/.test(url.pathname)
            ? cookie.includes('rh_session=sample') ? [201, { changeset: 999, commit: 1 }] : [401, { error: 'unauthorized', message: 'sign in first' }]
            : [404, { error: 'not-found', message: 'not found' }];
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  if (url.pathname === '/_fixes') return res.end(JSON.stringify(fixes));
  if (url.pathname === '/_edits') return res.end(JSON.stringify(edits));
  const byId = (id: string | null) => Object.values(views).find((v) => (v as { item: { id: string } }).item.id === id);
  const entity = /^\/v1\/entities\/(rh-[\w-]+)$/.exec(url.pathname)?.[1];
  if (entity) {
    const found = byId(entity) as { item: unknown } | undefined;
    if (found) return res.end(JSON.stringify(found.item));
  }
  const view = url.pathname === '/v1/view' ? (url.searchParams.get('id') ? byId(url.searchParams.get('id')) : views[url.searchParams.get('path') ?? '']) : listenAnswer(url);
  if (!view) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'not-found', message: 'not found' }));
  }
  res.end(JSON.stringify(view));
}).listen(Number(process.env.FIXTURE_PORT ?? 3002));
