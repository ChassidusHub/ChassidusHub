import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The catalog as a whole in the stand-in API (fixture-api.ts), for the
 * rebuilt project pages: its health, the site's status, the Missing board,
 * two projects (one open, one done) with things to take, the downloads, and
 * a small OpenAPI document for the reference. Every name here is sample
 * text written for the tests (לדוגמה). Taking, letting go, closing and
 * opening a project need the sample cookie; GET /_projects says what was
 * done, /_projects/reset forgets it.
 */
const he = (text: string) => ({ he: text });
const signedIn = (cookie: string) => /(?:^|; )rh_session=sample(?:;|$)/.test(cookie);

const health = {
  years: [
    { year: 5745, events: 40, withRecording: 30, withText: 10, withTranscript: 4 },
    { year: 5746, events: 20, withRecording: 20, withText: 5, withTranscript: 0 },
  ],
  sets: [{ id: 'rh-aaaaaal1', path: '/sets/the-rebbe-sample-sichos', name: he('שיחות לדוגמה'), items: 42, byType: { work: 2, unit: 40 } }],
  pages: { total: 120, checked: 30 },
  uncheckedScans: Array.from({ length: 12 }, (_, at) => ({ scan: `rh-aaaaasc${at}`, publication: null, title: he(`סריקה לדוגמה ${at + 1}`), pages: 10, checked: at % 3 })),
  recordings: { total: 50, transcribed: 20, synced: 12 },
  unsynced: [{ id: 'rh-aaaaarc1', path: null, title: he('הקלטה לדוגמה'), event: 'rh-3dvjfkyc' }],
  openSuggestions: [{ id: 301, title: 'הצעה לדוגמה', author: 'u-sample', authorName: 'קורא לדוגמה', authorIsBot: false, submittedAt: '2026-10-01T09:00:00Z' }],
  links: { checked: 300, dead: 1, lastChecked: '2026-10-10T03:00:00Z' },
  deadLinks: [{ url: 'https://example.org/sample-gone.pdf', status: 404, error: null, checkedAt: '2026-10-10T03:00:00Z', failingSince: '2026-09-01T03:00:00Z', entities: ['rh-aaaaaab1'] }],
  embeddings: { embedded: 0, waiting: 0 },
};

const days = Array.from({ length: 90 }, (_, at) => {
  const date = new Date(Date.parse('2026-10-11T00:00:00Z') - (89 - at) * 86_400_000).toISOString().slice(0, 10);
  const check = (down = 0) => ({ runs: 288, up: 288 - down, degraded: 0, down });
  return { date, checks: { site: check(), api: check(at === 80 ? 3 : 0), mcp: check(), database: check(), quota: check(), workers: check(), jobs: check() } };
});
const status = () => ({
  now: new Date().toISOString(),
  report: {
    checkedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    state: 'up',
    checks: ['site', 'api', 'mcp', 'database', 'quota', 'workers', 'jobs'].map((id) => ({ id, state: 'up', ms: 120, detail: null })),
    quota: { used: 12000, limit: 100000, resetsAt: '2026-10-12T00:00:00Z', runsOutAt: null },
    workers: [{ script: 'chassidushub-www', requests: 1000, errors: 0, exceeded: 0, cpuP50Ms: 3, cpuP99Ms: 40 }],
    days,
    incidents: [{ check: 'api', state: 'down', from: '2026-10-01T10:00:00Z', to: '2026-10-01T10:15:00Z', detail: 'timeout after 10 s' }],
  },
});

const event = (n: number, year: number) => ({ id: `rh-aaaaaev${n}`, type: 'event', path: `/events/${year}-05-${String(10 + (n % 15)).padStart(2, '0')}`, rev: 1, data: { date: `${year}-05-${String(10 + (n % 15)).padStart(2, '0')}`, title: he(`התוועדות לדוגמה ${n}`) } });
const missingEvents = Array.from({ length: 60 }, (_, n) => event(n, n < 40 ? 5745 : 5746));
const gaps = [{ collection: 'sample', item_id: 's1', kind: 'audio', role: 'main', source: 'sample', url: 'https://example.org/sample.mp3', label: 'הקלטה לדוגמה', hebrew_date: '5745-05-10', status: 'error', http_status: 404, checked_at: '2026-10-10T00:00:00Z', entity: null }];

function missing(url: URL) {
  const kind = url.searchParams.get('kind');
  const within = url.searchParams.get('within');
  const limit = Number(url.searchParams.get('limit') ?? 50);
  if (kind === 'files') return { kind, total: gaps.length, items: gaps.slice(0, limit) };
  if (kind === 'scans') return { kind, total: 1, items: [{ id: 'rh-aaaaaaw3', type: 'work', path: '/sample-one', rev: 1, data: { title: he('ספר ראשון לדוגמה') } }].slice(0, limit) };
  const items = missingEvents.filter((e) => !within || e.data.date.startsWith(within)).filter((_, at) => kind === 'texts' || at % 2 === 0);
  return { kind, total: items.length, items: items.slice(0, limit) };
}

const done: Record<string, unknown>[] = [];
const project = (slug: string) => ({
  id: 1,
  slug,
  name: slug === 'sample-done' ? 'פרויקט שהושלם לדוגמה' : 'הקלטות תשמ״ה לדוגמה',
  goal: 'מטרה לדוגמה.',
  set: null,
  status: slug === 'sample-done' ? 'merged' : 'open',
  focus: { missing: 'recordings', within: '5745' },
  creatorName: 'קורא לדוגמה',
  createdAt: '2026-10-01T09:00:00Z',
  total: 40,
  done: slug === 'sample-done' ? 40 : 30,
});
const todo = [
  { item: 'e1', kind: 'event', id: 'rh-aaaaaev0', date: '5745-05-10', title: he('התוועדות לדוגמה 0'), claimedBy: 'u-sample' },
  { item: 'e2', kind: 'event', id: 'rh-aaaaaev2', date: '5745-05-12', title: he('התוועדות לדוגמה 2'), claimedBy: 'u-other' },
  { item: 'e3', kind: 'event', id: 'rh-aaaaaev4', date: '5745-05-14', title: he('התוועדות לדוגמה 4'), claimedBy: null },
];

const openapi = {
  openapi: '3.1.0',
  info: { title: 'ChassidusHub API', version: '1' },
  servers: [{ url: 'https://api.chassidushub.org' }],
  tags: [{ name: 'Search', description: 'Finding things in the catalog' }, { name: 'Projects', description: 'Working through a gap together' }],
  paths: {
    '/v1/search': { get: { operationId: 'search', tags: ['Search'], summary: 'Search the catalog', 'x-access': 'public', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'The query' }] } },
    '/v1/projects/{slug}/next': { post: { operationId: 'claimNext', tags: ['Projects'], summary: 'Hand me the next item nobody holds', 'x-access': 'write', parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }] } },
  },
};

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.statusCode = status;
  res.end(JSON.stringify(body));
};

/** Answers a request about the catalog as a whole, and says whether it did. */
export function projectPagesAnswer(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  const path = url.pathname;
  if (req.method === 'GET') {
    if (path === '/v1/health') return json(res, health), true;
    if (path === '/v1/status') return json(res, status()), true;
    if (path === '/v1/missing') return json(res, missing(url)), true;
    if (path === '/v1/mirrors')
      return (
        json(res, {
          git: ['https://example.org/sample-catalog.git'],
          dumps: 'https://example.org/dumps',
          keys: [{ alg: 'ed25519', keyId: 'sample-key', publicKey: 'c2FtcGxlIHB1YmxpYyBrZXk=' }],
          others: [],
          editions: [{ tag: '2026-10-05', commit_seq: 1234, created_at: '2026-10-05T00:00:00Z', notes: null, dumps: { files: [{ name: 'catalog.sqlite', bytes: 12_345_678, sha256: 'a'.repeat(64), url: 'https://example.org/dumps/2026-10-05/catalog.sqlite' }], manifest: 'https://example.org/m.json', sha256sums: 'https://example.org/SHA256SUMS', signature: { alg: 'ed25519', keyId: 'sample-key' } } }],
        }),
        true
      );
    if (path === '/v1/projects') return json(res, { projects: [project('sample-5745'), project('sample-done')].filter((p) => !url.searchParams.get('status') || p.status === url.searchParams.get('status')) }), true;
    const one = /^\/v1\/projects\/([\w-]+)$/.exec(path)?.[1];
    if (one) return one !== 'nothing' ? json(res, { project: project(one), next: missingEvents.slice(0, 5), todo: one === 'sample-done' ? [] : todo }) : json(res, { error: 'not-found', message: 'not found' }, 404), true;
    if (path === '/openapi.json') return json(res, openapi), true;
    if (path === '/_projects') return json(res, done), true;
    if (path === '/_projects/reset') return (done.length = 0), json(res, {}), true;
    return false;
  }
  const action = /^\/v1\/projects(?:\/([\w-]+)\/(next|release|close))?$/.exec(path);
  if (req.method !== 'POST' || !action) return false;
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    if (!signedIn(req.headers.cookie ?? '')) return json(res, { error: 'unauthorized', message: 'sign in first' }, 401);
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    done.push({ slug: action[1] ?? null, what: action[2] ?? 'create', ...body });
    if (action[2] === 'next') return json(res, { item: todo[2] });
    if (!action[1]) return json(res, { id: 2, slug: body.slug }, 201);
    return json(res, { ok: true });
  });
  return true;
}
