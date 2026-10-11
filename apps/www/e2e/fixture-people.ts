import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Reports, the inbox and people in the stand-in API (fixture-api.ts): two
 * public reports and a private one (seen only by the sample reader, cookie
 * rh_session=sample), a suggestion that shares their numbers, the sample
 * reader's inbox and public page, and the reader app's item lookup. Writes
 * change the reports here, so a test can read them back. Every word here is
 * sample text written for the tests (לדוגמה).
 */
const signedIn = (cookie: string) => /(?:^|; )rh_session=sample(?:;|$)/.test(cookie);

const people = {
  'u-sample': { name: 'קורא לדוגמה', username: 'sample-reader', bot: false },
  'u-keeper': { name: 'שומר לדוגמה', username: 'sample-keeper', bot: false },
  'u-ocr': { name: 'מכונת קריאה', username: null, bot: true },
};
const labels = [
  { name: 'text', description: null, color: '#888888', open: 2 },
  { name: 'scan', description: null, color: '#888888', open: 1 },
];
const templates = [
  { type: 'wrong-text', label: { he: 'טעות בטקסט', en: 'Wrong text' }, template: { he: 'מה כתוב?\n\nמה צריך להיות?', en: '' }, private: false },
  { type: 'missing-page', label: { he: 'עמוד חסר', en: 'Missing page' }, template: { he: 'איזה עמוד חסר?', en: '' }, private: false },
  { type: 'rights', label: { he: 'זכויות', en: 'Rights' }, template: { he: 'מה הבעיה?', en: '' }, private: true },
];
const unit = { id: 'rh-aaaaaab1', type: 'unit', path: '/sample/1/1', name: { he: 'שיחה ראשונה' } };

interface SampleIssue {
  id: number;
  number: number;
  title: string;
  type: string;
  typeTitle: { he: string; en: string };
  state: 'open' | 'closed';
  stateReason: 'completed' | 'not_planned' | null;
  body: string;
  private: boolean;
  author: string | null;
  entity: typeof unit | null;
  labels: { name: string; color: string }[];
  assignees: string[];
  comments: number;
  createdAt: string;
  closedAt: string | null;
}

const issue = (number: number, more: Partial<SampleIssue>): SampleIssue => ({
  id: number,
  number,
  title: '',
  type: 'wrong-text',
  typeTitle: { he: 'טעות בטקסט', en: 'Wrong text' },
  state: 'open',
  stateReason: null,
  body: '',
  private: false,
  author: 'u-keeper',
  entity: null,
  labels: [],
  assignees: [],
  comments: 0,
  createdAt: '2026-10-01T10:00:00Z',
  closedAt: null,
  ...more,
});

let issues: SampleIssue[] = [];
let timelines: Record<number, unknown[]> = {};
let readLines = new Set<number>();
/** Reports sent without an account (POST /v1/reports), for the tests to read back (GET /_reports). */
let guestReports: unknown[] = [];

function reset() {
  issues = [
    issue(12, { title: 'מילה שגויה בפסקה הראשונה לדוגמה', body: 'כתוב כאן מילה לא נכונה, ראו #11 ו־@sample-keeper.', entity: unit, labels: [{ name: 'text', color: '#888' }], comments: 1, author: 'u-ocr' }),
    issue(11, { title: 'עמוד חסר לדוגמה', type: 'missing-page', typeTitle: { he: 'עמוד חסר', en: 'Missing page' }, labels: [{ name: 'scan', color: '#888' }], state: 'closed', stateReason: 'completed', closedAt: '2026-10-05T10:00:00Z' }),
    issue(14, { title: 'דיווח לבדיקת שינויים לדוגמה', body: 'פרטים לדוגמה.' }),
    issue(13, { title: 'בקשה פרטית לדוגמה', type: 'rights', typeTitle: { he: 'זכויות', en: 'Rights' }, private: true, author: 'u-sample' }),
  ];
  timelines = {
    12: [
      { type: 'comment', id: 1, at: '2026-10-02T10:00:00Z', author: 'u-keeper', body: 'תודה, אבדוק לדוגמה.', hidden: false },
      { type: 'event', id: 'e1', at: '2026-10-02T11:00:00Z', actor: 'u-keeper', kind: 'labeled', detail: { labels: ['text'] } },
    ],
  };
  readLines = new Set();
  guestReports = [];
}
reset();

const rights = (cookie: string) =>
  signedIn(cookie) ? { read: true, comment: true, edit: false, close: true, triage: true, moderate: false } : { read: true, comment: false, edit: false, close: false, triage: false, moderate: false };

function inbox(filter: string) {
  const lines = [
    { id: 1, reason: 'mention', subject: { kind: 'report', id: '12', number: 12, title: 'מילה שגויה בפסקה הראשונה לדוגמה', state: 'open', path: null }, actorName: 'שומר לדוגמה', actorUsername: 'sample-keeper', count: 2, at: '2026-10-03T10:00:00Z' },
    { id: 2, reason: 'review_requested', subject: { kind: 'changeset', id: '50', number: 50, title: 'הצעה לדוגמה', state: 'open', path: null }, actorName: 'שומר לדוגמה', actorUsername: 'sample-keeper', count: 1, at: '2026-10-02T10:00:00Z' },
  ].map((line) => ({ ...line, read: readLines.has(line.id) }));
  const shown = filter === 'all' ? lines : filter === 'unread' ? lines.filter((l) => !l.read) : lines.filter((l) => l.reason === filter);
  return { items: shown, unread: lines.filter((l) => !l.read).length, next: null };
}

/** One answer of this part of the API, or undefined when the address is not one of its. */
function answer(method: string, url: URL, body: Record<string, unknown>, cookie: string): [number, unknown] | undefined {
  const path = url.pathname;
  const me = signedIn(cookie);
  const visible = issues.filter((i) => !i.private || me);
  const refuse: [number, unknown] = [401, { error: 'unauthorized', message: 'sign in first' }];
  if (method === 'GET' && path === '/v1/issues/templates') return [200, { templates }];
  if (method === 'GET' && path === '/v1/labels') return [200, { labels }];
  if (method === 'GET' && path === '/v1/issues') {
    const q = (name: string) => url.searchParams.get(name);
    const state = q('state') ?? 'open';
    const of = visible.filter(
      (i) =>
        (!q('label') || i.labels.some((l) => l.name === q('label'))) &&
        (!q('type') || i.type === q('type')) &&
        (!q('entity') || i.entity?.id === q('entity')) &&
        (!q('author') || (q('author') === '@me' ? i.author === 'u-sample' : people[i.author as keyof typeof people]?.username === q('author'))) &&
        (!q('assignee') || (q('assignee') === '@me' ? i.assignees.includes('u-sample') : true)) &&
        (!q('q') || i.title.includes(q('q')!)),
    );
    return [200, { items: of.filter((i) => state === 'all' || i.state === state), people, counts: { open: of.filter((i) => i.state === 'open').length, closed: of.filter((i) => i.state === 'closed').length }, next: null }];
  }
  if (method === 'POST' && path === '/v1/issues') {
    if (!me) return refuse;
    const made = issue(20 + issues.length, { title: String(body.title), body: String(body.body ?? ''), type: String(body.type), author: 'u-sample', createdAt: '2026-10-11T10:00:00Z' });
    issues.push(made);
    return [201, made];
  }
  if (method === 'POST' && path === '/v1/reports') {
    guestReports.push(body);
    if (String(body.title).includes('captcha')) return [403, { error: 'forbidden', message: 'the captcha was not solved' }];
    return [201, { id: 900, number: null }];
  }
  const thread = /^\/v1\/threads\/(\d+)$/.exec(path);
  if (thread) return Number(thread[1]) === 50 ? [200, { kind: 'suggestion', number: 50, id: 50 }] : issues.some((i) => i.number === Number(thread[1])) ? [200, { kind: 'issue', number: Number(thread[1]), id: 1 }] : [404, { error: 'not-found', message: 'not found' }];
  const one = /^\/v1\/issues\/(\d+)(?:\/(state|labels|assignees|comments))?$/.exec(path);
  if (one) {
    const found = visible.find((i) => i.number === Number(one[1]));
    if (!found) return [404, { error: 'not-found', message: 'not found' }];
    const step = one[2];
    if (!step && method === 'GET') return [200, { issue: found, rights: rights(cookie), timeline: timelines[found.number] ?? [], people, fixedBy: [], subscribed: false }];
    if (!me) return refuse;
    const line = (kind: string, detail: Record<string, unknown>) => (timelines[found.number] ??= []).push({ type: 'event', id: `e${Date.now()}`, at: '2026-10-11T10:00:00Z', actor: 'u-sample', kind, detail });
    if (step === 'comments') {
      (timelines[found.number] ??= []).push({ type: 'comment', id: Date.now(), at: '2026-10-11T10:00:00Z', author: 'u-sample', body: String(body.body), hidden: false });
      found.comments += 1;
      return [201, { id: 1 }];
    }
    if (step === 'state') {
      found.state = body.state === 'open' ? 'open' : 'closed';
      found.stateReason = body.state === 'open' ? null : (body.state as 'completed' | 'not_planned');
      line(body.state === 'open' ? 'reopened' : 'closed', { outcome: body.state === 'not_planned' ? 'dismissed' : 'fixed' });
      return [200, { ok: true }];
    }
    if (step === 'labels') {
      found.labels = (body.labels as string[]).map((name) => ({ name, color: '#888' }));
      return [200, { ok: true }];
    }
    if (step === 'assignees') {
      found.assignees = (body.assignees as string[]).map((handle) => Object.entries(people).find(([, p]) => p.username === handle)?.[0] ?? handle);
      line('assigned', { assignees: found.assignees });
      return [200, { ok: true }];
    }
  }
  if (path === '/v1/inbox') return me ? [200, inbox(url.searchParams.get('filter') ?? 'unread')] : refuse;
  if (path === '/v1/inbox/read') {
    if (!me) return refuse;
    const ids = body.all ? [1, 2] : ((body.ids as number[]) ?? []);
    for (const id of ids) body.unread ? readLines.delete(id) : readLines.add(id);
    return [200, { changed: ids.length, unread: inbox('all').items.filter((l) => !l.read).length }];
  }
  if (path === '/v1/follows' && method === 'POST') return me ? [200, { ok: true }] : refuse;
  const person = /^\/v1\/people\/([\w-]+)$/.exec(path)?.[1];
  if (person) {
    if (person !== 'sample-reader' && person !== 'old-reader') return [404, { error: 'not-found', message: 'not found' }];
    return [200, {
      person: { id: 'u-sample', username: 'sample-reader', displayName: 'קורא לדוגמה', since: '2026-01-15T10:00:00Z', steward: false, admin: false, trust: 'trusted', suspended: false },
      ...(person === 'old-reader' ? { movedFrom: 'old-reader' } : {}),
      counts: { suggestions: 4, merged: 3, reviews: 2, issues: 1, comments: 5 },
      activity: [
        { kind: 'issue', at: '2026-10-08T10:00:00Z', thread: { kind: 'report', id: '13', number: 13, title: 'בקשה ציבורית לדוגמה', state: 'open', path: null } },
        { kind: 'comment', at: '2026-10-02T10:00:00Z', thread: { kind: 'report', id: '12', number: 12, title: 'מילה שגויה בפסקה הראשונה לדוגמה', state: 'open', path: null }, excerpt: 'תגובה קצרה לדוגמה' },
        { kind: 'suggestion', at: '2026-09-20T10:00:00Z', thread: { kind: 'changeset', id: '50', number: 50, title: 'הצעה לדוגמה', state: 'merged', path: null } },
      ],
    }];
  }
  if (path === '/v1/app/item') return url.searchParams.get('farbrengen') === '1' || url.searchParams.get('unit') ? [200, { id: unit.id, path: unit.path }] : [404, { error: 'not-found', message: 'not found' }];
  return undefined;
}

/** Answers the request when it is one of this part's; true when it did. GET /_people_reset starts the reports afresh, GET /_reports reads the guest reports. */
export function servePeople(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  if (url.pathname === '/_people_reset') {
    reset();
    res.end('{}');
    return true;
  }
  if (url.pathname === '/_reports') {
    res.end(JSON.stringify(guestReports));
    return true;
  }
  if (!/^\/v1\/(issues|labels|threads\/|inbox|follows|people\/|app\/item|reports)/.test(url.pathname)) return false;
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const said = answer(req.method ?? 'GET', url, JSON.parse(raw || '{}'), req.headers.cookie ?? '') ?? [404, { error: 'not-found', message: 'not found' }];
    res.statusCode = said[0];
    res.end(JSON.stringify(said[1]));
  });
  return true;
}
