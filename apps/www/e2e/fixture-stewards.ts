import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The stewards' pages in the stand-in API (fixture-api.ts): a steward
 * signed in by the cookie rh_session=steward (also the platform's admin), a
 * small tree to organize, people, reports and takedown requests, adding a
 * file, and what a showcase reads. Everything it is sent is kept for the
 * tests to read back (GET /_stewards) until GET /_stewards/reset. Every name
 * here is sample text written for the tests (לדוגמה).
 */
const he = (text: string) => ({ he: text });
const steward = (cookie: string) => /(?:^|; )rh_session=steward(?:;|$)/.test(cookie);
export const SAMPLE_SHA = 'ab'.repeat(32);

const node = (id: string, type: string, path: string, name: string, counts: Record<string, number> = {}) => ({ id, type, path, name: he(name), counts });
const top = [
  node('rh-org0a1', 'set', '/sets/sample-chassidus', 'ספרי חסידות לדוגמה', { sets: 1, items: 2 }),
  node('rh-org0a2', 'set', '/sets/sample-sichos', 'שיחות לדוגמה', { items: 4 }),
  node('rh-org0a3', 'set', '/sets/sample-empty', 'סט ריק לדוגמה'),
];
const inside = [
  node('rh-org0b1', 'set', '/sets/sample-inner', 'תת־סט לדוגמה', { items: 1 }),
  node('rh-org0c1', 'work', '/sample-a', 'ספר א׳ לדוגמה', { units: 12 }),
  node('rh-org0c2', 'work', '/sample-b', 'ספר ב׳ לדוגמה', { units: 3 }),
];
const entities: Record<string, { id: string; type: string; path: string | null; data: Record<string, unknown> }> = {
  'rh-org0a1': { id: 'rh-org0a1', type: 'set', path: '/sets/sample-chassidus', data: { name: he('ספרי חסידות לדוגמה') } },
  'rh-org0b1': { id: 'rh-org0b1', type: 'set', path: '/sets/sample-inner', data: { name: he('תת־סט לדוגמה'), parent: 'rh-org0a1' } },
  'rh-3dvjfkyc': { id: 'rh-3dvjfkyc', type: 'event', path: '/events/5732-11-20', data: { date: '5732-11-20', kind: 'farbrengen', title: he('התוועדות לדוגמה') } },
  'rh-aaaaaab1': {
    id: 'rh-aaaaaab1',
    type: 'unit',
    path: '/sample/1/1',
    data: { label: he('שיחה ראשונה'), editions: [{ kind: 'pdf', role: 'sicha', url: 'https://drive.google.com/file/d/sampleprintedscan1/view' }] },
  },
};
const recordings = [
  { id: 'rh-1awcd7t9', type: 'recording', path: null, data: { event: 'rh-3dvjfkyc', part: 1, title: he('שיחה א׳'), url: `http://localhost:3002/objects/${SAMPLE_SHA}` } },
  { id: 'rh-aaaaaar2', type: 'recording', path: null, data: { event: 'rh-3dvjfkyc', part: 2, title: he('ניגון'), url: 'http://localhost/sample-2.mp3' } },
];
type Found = { id: string; type: string; path: string | null; data: Record<string, unknown> };
const found: Found[] = [...[...top, ...inside].map((n): Found => ({ id: n.id, type: n.type, path: n.path, data: { name: n.name } })), ...Object.values(entities).filter((e) => e.type !== 'set')];

const firstPeople = () => [
  { id: 'u-steward', username: 'sample-steward', displayName: 'שומר לדוגמה', steward: true, admin: true, createdAt: '2026-09-01T10:00:00Z', passkeys: 1, google: null, suspended: false, suggestions: 12 },
  { id: 'u-sample', username: 'sample-reader', displayName: 'קורא לדוגמה', steward: false, admin: false, createdAt: '2026-10-01T10:00:00Z', passkeys: 1, google: null, suspended: false, suggestions: 3 },
];
const firstReports = () => [{ id: 51, entity_id: 'rh-aaaaaab1', reason: 'wrong-text', note: 'מילה חסרה בפסקה השניה (לדוגמה).', created_at: '2026-10-10T10:00:00Z' }];
const firstTakedowns = () => [
  {
    report: 52,
    at: '2026-10-09T10:00:00Z',
    name: 'בעל זכויות לדוגמה',
    email: 'owner@example.org',
    relation: 'rights-holder',
    target: 'https://chassidushub.org/listen/5732/rh-3dvjfkyc',
    statement: 'ההקלטה הזו שלי, ולא נתתי רשות (לדוגמה).',
    entityId: 'rh-3dvjfkyc',
    files: [{ sha256: SAMPLE_SHA, mime: 'audio/mpeg', bytes: 5_400_000, rights: 'unknown', usedBy: 'rh-1awcd7t9' }],
  },
];

let people = firstPeople();
let reports = firstReports();
let takedowns = firstTakedowns();
/** What the stewards' pages sent, for the tests to read back. */
let sent: { path: string; query: string; type: string | null; bytes: number; body: unknown }[] = [];
const reset = () => ((people = firstPeople()), (reports = firstReports()), (takedowns = firstTakedowns()), (sent = []));

const NO: [number, unknown] = [403, { error: 'forbidden', message: 'only stewards see this' }];

function answer(method: string, path: string, url: URL, cookie: string, body: unknown): [number, unknown] | undefined {
  const query = (name: string) => url.searchParams.get(name);
  if (method === 'GET' && path === '/v1/auth/me' && steward(cookie))
    return [200, {
      person: { id: 'u-steward', displayName: 'שומר לדוגמה', username: 'sample-steward', steward: true, admin: true },
      passkeys: [{ credentialId: 'k2', deviceType: 'multiDevice', backedUp: true, createdAt: '2026-09-01T10:00:00Z', lastUsedAt: '2026-10-10T10:00:00Z' }],
      googleAccounts: [],
      emails: [],
      notifications: { mode: 'off', email: null, lang: 'he' },
      google: true,
      email: true,
    }];
  if (method === 'GET' && path === '/v1/tree') {
    const root = query('root');
    if (!root) return [200, { root: null, children: top, more: 0 }];
    if (root === 'rh-org0a1') return [200, { root: top[0], children: inside, more: 0 }];
    if (root === 'rh-org0b1') return [200, { root: inside[0], children: [], more: 0 }];
    return [404, { error: 'not-found', message: 'not found' }];
  }
  if (method === 'GET' && entities[path.slice('/v1/entities/'.length)] && path.startsWith('/v1/entities/rh-org')) return [200, entities[path.slice('/v1/entities/'.length)]];
  if (method === 'GET' && path === '/v1/search') {
    const q = query('q') ?? '';
    const type = query('type');
    return [200, { query: q, date: null, results: found.filter((f) => (!type || f.type === type) && JSON.stringify(f.data).includes(q)).slice(0, 12) }];
  }
  if (method === 'GET' && path === '/v1/entities/batch') return [200, { items: (query('ids') ?? '').split(',').flatMap((id) => (entities[id] ? [entities[id]] : [])) }];
  if (method === 'GET' && path === '/v1/entities/batch/linked') return [200, { linked: Object.fromEntries((query('ids') ?? '').split(',').map((id) => [id, recordings.filter((r) => r.data.event === id)])) }];
  if (method === 'GET' && path === '/v1/stats') return [200, { counts: { work: 3, unit: 120, event: 40, recording: 80 } }];

  // Organizing, as the steward: a preview, then one suggestion they may approve themselves.
  if (method === 'POST' && path === '/v1/organize/preview') {
    if (!steward(cookie)) return [401, { error: 'unauthorized', message: 'sign in first' }];
    const ops = (body as { operations?: unknown[] }).operations ?? [];
    return [200, { title: `Organize: ${ops.length} steps`, items: [{ id: 'rh-org0a2', type: 'set', name: 'שיחות לדוגמה', isNew: false, deleted: false, pathBefore: '/sets/sample-sichos', path: '/sets/sample-sichos', changes: [{ path: '/order', before: 'b', after: 'a' }] }], redirects: [], warnings: [] }];
  }
  if (method === 'POST' && path === '/v1/organize' && steward(cookie)) return sent.push({ path, query: '', type: null, bytes: 0, body }), [201, { suggestion: { id: 310, number: 61, status: 'open', title: 'organize' }, merged: false, mayApprove: true, preview: {} }];
  if (method === 'POST' && path === '/v1/suggestions/310/approve') return steward(cookie) ? (sent.push({ path, query: '', type: null, bytes: 0, body }), [200, { merged: true }]) : NO;

  // The stewards' tools.
  if (path.startsWith('/v1/admin/') || path.startsWith('/v1/reports')) {
    if (!steward(cookie)) return NO;
    if (method === 'GET' && path === '/v1/admin/people') {
      const q = query('q') ?? '';
      return [200, { me: { admin: true }, people: people.filter((p) => !q || p.displayName.includes(q) || (p.username ?? '').includes(q)) }];
    }
    const person = /^\/v1\/admin\/people\/(u-[0-9a-z-]+)\/(role|suspend)$/.exec(path);
    if (method === 'POST' && person) {
      const p = people.find((x) => x.id === person[1]);
      if (!p) return [404, { error: 'not-found', message: 'not found' }];
      const b = body as { steward?: boolean; admin?: boolean; on?: boolean };
      if (person[2] === 'suspend') p.suspended = !!b.on;
      else Object.assign(p, b.steward !== undefined ? { steward: b.steward } : {}, b.admin !== undefined ? { admin: b.admin } : {});
      return [200, { ok: true }];
    }
    if (method === 'GET' && path === '/v1/admin/takedowns') return [200, { takedowns }];
    const file = /^\/v1\/admin\/files\/([0-9a-f]{64})\/takedown$/.exec(path);
    if (method === 'POST' && file) {
      for (const d of takedowns) for (const f of d.files) if (f.sha256 === file[1]) f.rights = 'preserved';
      sent.push({ path, query: '', type: null, bytes: 0, body });
      return [200, { ok: true }];
    }
    if (method === 'GET' && path === '/v1/reports') return [200, { reports, items: Object.values(entities).filter((e) => reports.some((r) => r.entity_id === e.id)) }];
    const close = /^\/v1\/reports\/(\d+)\/close$/.exec(path);
    if (method === 'POST' && close) {
      const id = Number(close[1]);
      reports = reports.filter((r) => r.id !== id);
      takedowns = takedowns.filter((d) => d.report !== id);
      sent.push({ path, query: '', type: null, bytes: 0, body });
      return [200, { ok: true }];
    }
    return [404, { error: 'not-found', message: 'not found' }];
  }

  // Adding what is missing: the machine's proposal, then the file or the words.
  if (method === 'POST' && path === '/v1/uploads/propose') {
    return [200, {
      date: '5732-11-20',
      as: null,
      candidates: [{ id: 'rh-3dvjfkyc', type: 'event', path: '/events/5732-11-20', label: he('התוועדות לדוגמה'), date: '5732-11-20', why: 'date' }],
      usedBy: [],
    }];
  }
  return undefined;
}

/**
 * Answers what is the stewards' and says so; anything else is left to the
 * rest of the stand-in. Uploads are read as bytes; everything else as JSON.
 */
export function stewardsAnswer(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  const path = url.pathname;
  if (path === '/_stewards') return res.end(JSON.stringify({ sent, people, reports, takedowns })), true;
  if (path === '/_stewards/reset') return reset(), res.end('{}'), true;
  const method = req.method ?? 'GET';
  const cookie = req.headers.cookie ?? '';
  const upload = method === 'POST' && (path === '/v1/uploads' || path === '/v1/hanachos/text');
  if (method === 'GET') {
    const result = answer(method, path, url, cookie, null);
    if (!result) return false;
    res.statusCode = result[0];
    res.end(JSON.stringify(result[1]));
    return true;
  }
  if (method !== 'POST' || !/^\/v1\/(organize(\/preview)?|uploads(\/propose)?|hanachos\/text|admin\/|reports\/|suggestions\/310\/approve)/.test(path)) return false;
  if (path === '/v1/organize' && !steward(cookie)) return false;
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    let result: [number, unknown];
    if (upload) {
      if (!steward(cookie)) result = [401, { error: 'unauthorized', message: 'sign in first' }];
      else {
        sent.push({ path, query: url.search, type: req.headers['content-type'] ?? null, bytes: raw.length, body: path === '/v1/hanachos/text' ? JSON.parse(raw.toString() || '{}') : null });
        result = [201, { suggestion: path === '/v1/uploads' ? 77 : 78 }];
      }
    } else result = answer(method, path, url, cookie, JSON.parse(raw.toString() || '{}')) ?? [404, { error: 'not-found', message: 'not found' }];
    res.statusCode = result[0];
    res.end(JSON.stringify(result[1]));
  });
  return true;
}
