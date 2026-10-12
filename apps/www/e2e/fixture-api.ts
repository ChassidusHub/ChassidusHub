import { createServer } from 'node:http';
import { itemToolsAnswer } from './fixture-item-tools';
import { libraryAnswer } from './fixture-library';
import { snapshotAnswer } from './fixture-snapshot';
import { listenAnswer, paragraphWords, shelves } from './fixture-listen';
import { searchAnswer } from './fixture-search';
import { suggestionsAnswer } from './fixture-suggestions';
import { servePeople } from './fixture-people';
import { projectPagesAnswer } from './fixture-project-pages';
import { stewardsAnswer } from './fixture-stewards';

/**
 * A stand-in for the ChassidusHub API in the browser tests: GET /v1/view for
 * a few made-up pages, so the reading page is tested without a database,
 * listening's reads (fixture-listen.ts), the library's (fixture-library.ts),
 * search's (fixture-search.ts),
 * and POST /v1/fix as a signed-in reader (the cookie rh_session=sample) or a
 * signed-out one; and signing in and the account (/v1/auth/*) the same way.
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
    scan: { scan: 'rh-aaaaaas1', file: 'f'.repeat(64), firstPage: 7, lastPage: 9, publication: 'rh-aaaaaap1', url: 'https://files.example.org/sample.pdf' },
    recordings: [
      { id: 'rh-aaaaaar1', path: null, name: name('הקלטה ראשונה'), durationMs: 3_725_000 },
      { id: 'rh-aaaaaar2', path: null, name: name('הקלטה שניה'), durationMs: null },
    ],
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
  '/sample/1/4': {
    item: {
      id: 'rh-aaaaaab4',
      type: 'unit',
      path: '/sample/1/4',
      rev: 1,
      data: {
        label: name('שיחה רביעית'),
        editions: [
          { kind: 'pdf', role: 'translated', label: 'תרגום לדוגמה', url: 'https://drive.google.com/file/d/sample-translated/view' },
          { kind: 'pdf', role: 'sicha', label: 'drive', url: 'https://drive.google.com/file/d/sample-printed/view' },
        ],
      },
    },
    pathBar: bar(2),
    previous: null,
    next: null,
    text: null,
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

const signedIn = (cookie: string) => /(?:^|; )rh_session=sample(?:;|$)/.test(cookie);
/** The sample reader's name, as changed on the account page; and the addresses sign-in links were sent to (GET /_mails). */
let displayName = 'קורא לדוגמה';
const mails: string[] = [];

/** /v1/auth/*, as the API answers it, for the sign-in and account pages: signed in by the sample cookie. */
function auth(method: string, path: string, body: Record<string, unknown>, cookie: string, url: URL): [number, unknown, string[]?] {
  if (method === 'GET' && path === 'me') {
    if (!signedIn(cookie)) return [200, { person: null, google: true, email: true }];
    return [200, {
      person: { id: 'u-sample', displayName, username: 'sample-reader' },
      passkeys: [{ credentialId: 'k1', deviceType: 'multiDevice', backedUp: true, createdAt: '2026-10-01T10:00:00Z', lastUsedAt: '2026-10-10T10:00:00Z' }],
      googleAccounts: [],
      emails: [{ email: 'reader@example.org', createdAt: '2026-10-01T10:00:00Z', google: false }],
      notifications: { mode: 'off', email: null, lang: 'he' },
      google: true,
      email: true,
    }];
  }
  if (method === 'GET' && path === 'username') {
    const name = url.searchParams.get('name') ?? '';
    return [200, { name: name || null, available: name !== 'taken', reason: name === 'taken' ? 'taken' : null, suggestion: 'sample-reader' }];
  }
  if (path === 'email/start') {
    if (typeof body.email !== 'string' || !/@.+\./.test(body.email)) return [400, { error: 'bad-request', message: 'an email address, like name@example.com' }];
    mails.push(body.email);
    return [200, { sent: true }];
  }
  if (path === 'sign-out') return [200, { signedOut: true }, ['rh_session=; Path=/; Max-Age=0']];
  if (path === 'name') {
    if (!signedIn(cookie)) return [401, { error: 'unauthorized', message: 'sign in first' }];
    displayName = String(body.name);
    return [200, { person: { id: 'u-sample', displayName } }];
  }
  if (path === 'passkey/sign-in/options') return [200, { challengeId: 'c1', options: { challenge: 'Y2hhbGxlbmdl', rpId: 'localhost', allowCredentials: [] } }];
  return [404, { error: 'not-found', message: 'not found' }];
}

/** The back room's sample: one live fix waiting to be looked at after, and what the machines wrote (sample names only). */
const liveDecided = new Map<number, string>();
const liveList = () => ({
  suggestions: [{ id: 301, number: 41, title: 'A fix to the words', author: 'u-sample', status: 'merged', post_review: 'pending', submitted_at: '2026-10-11T09:00:00Z', items: 1 }],
  people: { 'u-sample': { name: 'קורא לדוגמה', username: 'sample-reader', bot: false } },
  next: null,
});
const liveOne = (cookie: string) => ({
  changeset: { id: 301, title: 'A fix to the words', status: 'merged', post_review: 'pending' },
  entries: [{ entityId: 'rh-aaaaaab1', type: 'unit', before: { path: '/sample/1/1' }, after: { path: '/sample/1/1' }, changes: [{ path: '/body/versions/he/segments/p2/text', before: [{ text: 'פסקה שניה לדוגמה, עם הערה נוספת' }], after: [{ text: 'פסקה שנייה לדוגמה, עם הערה נוספת' }] }], conflicts: [] }],
  total: 1,
  mayApprove: signedIn(cookie),
  mayApproveReason: signedIn(cookie) ? null : 'sign in to review',
});
const toCheck = {
  transcripts: [{ event: 'rh-3dvjfkyc', path: '/listen/5732/rh-3dvjfkyc', title: { he: 'התוועדות לדוגמה' }, date: null, paragraphs: 40, checked: 3, made: '2026-10-10T00:00:00Z' }],
  scans: [],
  texts: [{ entity: 'rh-aaaaaab2', type: 'unit', path: '/sample/1/2', title: { he: 'שיחה שניה' }, label: { he: 'שיחה שניה' }, segments: 2, checked: 0, made: '2026-10-09T00:00:00Z' }],
  totals: { transcripts: 1, paragraphs: 40, scans: 0, pages: 0, texts: 1, segments: 2 },
};

/** Takedown requests asked for (GET /_takedowns), checked as core's takedown.ts checks them. */
const takedowns: unknown[] = [];
function takedown(input: Record<string, string>, from: string | string[] | undefined): [number, unknown] {
  if (!input.name) return [400, { error: 'invalid', message: 'your name, up to 200 characters' }];
  if ((input.statement ?? '').length < 10) return [400, { error: 'invalid', message: 'say in a few words why (10 to 4000 characters)' }];
  takedowns.push({ ...input, from: from ?? null });
  return [201, { id: 40 + takedowns.length, answerWithinDays: 14 }];
}

/** The sample reader's API keys and connected app (GET /_tokens), and the one request to connect (oar-sample), answered once. */
let tokens: Record<string, unknown>[] = [];
const tokensReset = () =>
  (tokens = [{ id: 'oac-sample', kind: 'oauth', name: 'Claude', prefix: 'cho_', scopes: ['read', 'write'], createdAt: '2026-10-01T00:00:00Z', lastUsedAt: null, expiresAt: null, revokedAt: null, client: { id: 'https://claude.ai/oauth/claude-code-client-metadata', name: 'Claude', uri: null, host: 'claude.ai' } }]);
tokensReset();
let consentAnswered: unknown = null;
function tokensAnswer(method: string, path: string, input: Record<string, unknown>, cookie: string): [number, unknown] {
  if (!signedIn(cookie)) return [401, { error: 'unauthorized', message: 'sign in first' }];
  if (method === 'GET') return [200, { tokens }];
  if (method === 'POST') {
    if (typeof input.name !== 'string' || !input.name) return [400, { error: 'invalid', message: 'give the token a name of 1 to 80 characters (what uses it)' }];
    const id = `tok-${tokens.length}`;
    tokens.unshift({ id, kind: 'personal', name: input.name, prefix: 'chp_abcd', scopes: input.scopes, createdAt: '2026-10-11T00:00:00Z', lastUsedAt: null, expiresAt: null, revokedAt: null });
    return [201, { token: 'chp_abcdSECRETsample', id }];
  }
  if (method === 'DELETE') return (tokens = tokens.filter((token) => `/${token.id}` !== path)), [200, { ok: true }];
  return [404, { error: 'not-found', message: 'not found' }];
}
const consentRequest = { id: 'oar-sample', client: { id: 'https://claude.ai/oauth/claude-code-client-metadata', name: 'Claude', uri: null, kind: 'metadata', host: 'claude.ai' }, redirectUri: 'https://claude.ai/api/mcp/auth_callback', redirectHost: 'claude.ai', loopback: false, scopes: ['read', 'write'], resource: 'https://api.chassidushub.org/mcp', expiresAt: '2026-10-11T12:00:00Z' };

createServer((req, res) => {
  if (suggestionsAnswer(req, res)) return;
  const url = new URL(req.url ?? '/', 'http://local');
  res.setHeader('Content-Type', 'application/json');
  if (projectPagesAnswer(req, res, url)) return;
  if (stewardsAnswer(req, res, url)) return;
  const tokensPath = /^\/v1\/tokens(\/[\w-]+)?$/.exec(url.pathname);
  const consent = url.pathname === '/v1/oauth/requests/oar-sample';
  if (tokensPath || consent) {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const cookie = req.headers.cookie ?? '';
      const input = JSON.parse(raw || '{}');
      const [status, answer]: [number, unknown] = tokensPath
        ? tokensAnswer(req.method ?? 'GET', tokensPath[1] ?? '', input, cookie)
        : !signedIn(cookie)
          ? [401, { error: 'unauthorized', message: 'sign in first' }]
          : consentAnswered
            ? [404, { error: 'not-found', message: 'this request to connect is over' }]
            : req.method === 'POST'
              ? ((consentAnswered = input), [200, { redirect: `http://localhost:3002/_callback?approve=${input.approve}` }])
              : [200, consentRequest];
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  if (url.pathname === '/v1/sitemap') return res.end(JSON.stringify({ pageSize: 10000, sitemaps: [{ type: 'unit', page: 1, count: 2, lastmod: '2026-10-10T00:00:00Z' }] }));
  if (url.pathname === '/v1/sitemap/unit/1') return res.end(JSON.stringify({ type: 'unit', page: 1, items: [{ id: 'rh-aaaaaab1', path: '/sample/1/1', lastmod: '2026-10-10T00:00:00Z' }, { id: 'rh-aaaaaab2', path: null, lastmod: null }] }));
  if (url.pathname === '/openapi.json') return res.end(JSON.stringify({ info: { title: 'ChassidusHub API', version: '1' }, paths: { '/v1/search': { get: { operationId: 'search', summary: 'Search the catalog' } } } }));
  if (url.pathname === '/_tokens') return res.end(JSON.stringify(tokens));
  if (url.pathname === '/_tokens/reset') return (tokensReset(), (consentAnswered = null), res.end('{}'));
  if (url.pathname === '/_consent') return res.end(JSON.stringify(consentAnswered));
  if (url.pathname === '/_callback') return res.end(JSON.stringify({ back: true }));
  if (servePeople(req, res, url)) return;
  const authPath = /^\/v1\/auth\/([a-z/-]+)$/.exec(url.pathname)?.[1];
  if (authPath) {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const [status, answer, cookies] = auth(req.method ?? 'GET', authPath, JSON.parse(raw || '{}'), req.headers.cookie ?? '', url);
      if (cookies) res.setHeader('Set-Cookie', cookies);
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  const reviewLive = /^\/v1\/suggestions\/(\d+)\/review-live$/.exec(url.pathname);
  if (req.method === 'POST' && reviewLive) {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const id = Number(reviewLive[1]);
      const [status, answer] = !signedIn(req.headers.cookie ?? '')
        ? [401, { error: 'unauthorized', message: 'sign in first' }]
        : liveDecided.has(id)
          ? [409, { error: 'state', message: 'this change is not waiting for review' }]
          : (liveDecided.set(id, JSON.parse(raw || '{}').verdict), [200, {}]);
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  if (url.pathname === '/v1/suggestions' && url.searchParams.get('postReview') === 'true') return res.end(JSON.stringify(liveList()));
  if (url.pathname === '/v1/suggestions/301') return res.end(JSON.stringify(liveOne(req.headers.cookie ?? '')));
  if (url.pathname === '/v1/machine/to-check') return res.end(JSON.stringify(toCheck));
  if (url.pathname === '/_live') return res.end(JSON.stringify(Object.fromEntries(liveDecided)));
  if (url.pathname === '/_live/reset') return (liveDecided.clear(), res.end('{}'));
  if (req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const cookie = req.headers.cookie ?? '';
      const [status, answer] =
        itemToolsAnswer('POST', url, JSON.parse(raw || '{}'), cookie) ??
        (url.pathname === '/v1/fix'
          ? fix(JSON.parse(raw || '{}'), cookie)
          : url.pathname === '/v1/organize'
            ? cookie.includes('rh_session=sample') ? (edits.push(JSON.parse(raw || '{}')), [201, { suggestion: { id: 200 + edits.length, status: 'open', title: 'edit' }, merged: false, mayApprove: false, preview: {} }]) : [401, { error: 'unauthorized', message: 'sign in first' }]
          : url.pathname === '/v1/takedowns'
            ? takedown(JSON.parse(raw || '{}'), req.headers['x-forwarded-for'])
          : /^\/v1\/fix\/\d+\/undo$/.test(url.pathname)
            ? cookie.includes('rh_session=sample') ? [201, { changeset: 999, commit: 1 }] : [401, { error: 'unauthorized', message: 'sign in first' }]
            : [404, { error: 'not-found', message: 'not found' }]);
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  // The browser reads some of it too (a sefer's printings).
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname === '/_fixes') return res.end(JSON.stringify(fixes));
  if (url.pathname === '/_edits') return res.end(JSON.stringify(edits));
  if (url.pathname === '/_mails') return res.end(JSON.stringify(mails));
  if (url.pathname === '/_takedowns') return res.end(JSON.stringify(takedowns));
  const searched = searchAnswer(url);
  if (searched) {
    res.statusCode = searched[0];
    return res.end(JSON.stringify(searched[1]));
  }
  const tools = itemToolsAnswer('GET', url, {}, req.headers.cookie ?? '');
  if (tools) return ((res.statusCode = tools[0]), res.end(JSON.stringify(tools[1])));
  const byId = (id: string | null) => Object.values(views).find((v) => (v as { item: { id: string } }).item.id === id);
  const entity = /^\/v1\/entities\/(rh-[\w-]+)$/.exec(url.pathname)?.[1];
  if (entity) {
    const found = byId(entity) as { item: unknown } | undefined;
    if (found) return res.end(JSON.stringify(found.item));
  }
  const view = (url.pathname === '/v1/view' ? (url.searchParams.get('id') ? byId(url.searchParams.get('id')) : views[url.searchParams.get('path') ?? '']) : undefined) ?? libraryAnswer(url, shelves) ?? listenAnswer(url) ?? snapshotAnswer(url);
  if (!view) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'not-found', message: 'not found' }));
  }
  res.end(JSON.stringify(view));
}).listen(Number(process.env.FIXTURE_PORT ?? 3002));
