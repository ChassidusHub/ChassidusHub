import { createServer } from 'node:http';

/**
 * A stand-in for the ChassidusHub API in the browser tests: GET /v1/view for
 * a few made-up pages, so the reading page is tested without a database.
 * Every word here is sample text written for the tests (לדוגמה), never a
 * sefer's own words. Every other request goes on to the real API (`UPSTREAM`,
 * default https://api.chassidushub.org), which the other screens' tests read
 * as they do on main. `FIXTURE_PORT` picks the port (default 3002).
 */
const upstream = process.env.UPSTREAM ?? 'https://api.chassidushub.org';
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

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname === '/v1/view' ? (url.searchParams.get('path') ?? '') : '';
  if (path.startsWith('/sample/')) {
    const view = views[path];
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = view ? 200 : 404;
    return res.end(JSON.stringify(view ?? { error: 'not-found', message: 'not found' }));
  }
  try {
    const answer = await fetch(`${upstream}${url.pathname}${url.search}`, { method: req.method, headers: { accept: 'application/json' } });
    res.statusCode = answer.status;
    res.setHeader('Content-Type', answer.headers.get('content-type') ?? 'application/json');
    res.end(Buffer.from(await answer.arrayBuffer()));
  } catch {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'upstream', message: 'the real API could not be reached' }));
  }
}).listen(Number(process.env.FIXTURE_PORT ?? 3002));
