import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Suggestions in the stand-in API (fixture-api.ts): a few made-up ones, so
 * the list, one suggestion's page and what waits for review are tested without
 * the live catalog. #42 waits for review and clashes with the site on one
 * field; #43 is in, sent by the sample reader; #44 is the sample reader's own,
 * still open; an import with no #number waits too; #45 is an issue. The sample
 * reader (cookie rh_session=sample) may approve. Every word here is sample text
 * written for the tests (לדוגמה). What was done is read back at GET /_suggestions.
 */
const people = {
  'u-sample': { name: 'קורא לדוגמה', username: 'sample-reader', bot: false },
  'u-other': { name: 'שולח לדוגמה', username: 'sample-sender', bot: false },
  'u-keeper': { name: 'שומר לדוגמה', username: 'sample-keeper', bot: false },
};

type Status = 'open' | 'merged' | 'sent_back' | 'withdrawn';
interface Sample {
  id: number;
  number: number | null;
  title: string;
  description: string | null;
  author: string;
  status: Status;
  at: string;
  entries: unknown[];
  timeline: Record<string, unknown>[];
  reviewRequests: { reviewer: string; requestedBy: string | null; at: string }[];
}

const before = 'פסקה שניה לדוגמה, עם הערה נוספת ועוד כמה מילים שנשארו כמו שהן לאורך כל הפסקה הזאת.';
const fresh = (): Sample[] => [
  {
    id: 401,
    number: 42,
    title: 'תיקון מילה בשיחה לדוגמה',
    description: 'מילה אחת תוקנה לפי הדפוס. ראו גם #44.',
    author: 'u-other',
    status: 'open',
    at: '2026-10-10T08:00:00Z',
    entries: [
      {
        entityId: 'rh-aaaaaab1',
        type: 'unit',
        before: { label: { he: 'שיחה ראשונה' } },
        after: { label: { he: 'שיחה ראשונה לדוגמה' } },
        changes: [
          { path: '/body/versions/he/segments/p2/text', before: [{ text: before }], after: [{ text: before.replace('שניה', 'שנייה') }] },
          { path: '/label', before: { he: 'שיחה ראשונה' }, after: { he: 'שיחה ראשונה לדוגמה' } },
        ],
        conflicts: [],
      },
    ],
    timeline: [
      { type: 'event', id: 'opened', at: '2026-10-10T08:00:00Z', actor: 'u-other', kind: 'opened', detail: {} },
      { type: 'event', id: 'submitted', at: '2026-10-10T08:00:00Z', actor: 'u-other', kind: 'submitted', detail: {} },
      { type: 'event', id: 'e1', at: '2026-10-10T08:01:00Z', actor: 'u-other', kind: 'review_requested', detail: { reviewers: ['u-keeper'] } },
      { type: 'comment', id: 1, at: '2026-10-10T09:00:00Z', author: 'u-keeper', body: 'בדקתי מול הדפוס, נראה נכון.', hidden: false, parent: null, anchor: null, review: null, resolved: false },
      { type: 'comment', id: 2, at: '2026-10-10T09:30:00Z', author: 'u-other', body: 'תודה!', hidden: false, parent: 1, anchor: null, review: null, resolved: false },
    ],
    reviewRequests: [{ reviewer: 'u-keeper', requestedBy: 'u-other', at: '2026-10-10T08:01:00Z' }],
  },
  {
    id: 402,
    number: 43,
    title: 'שם חדש לשיחה לדוגמה',
    description: null,
    author: 'u-sample',
    status: 'merged',
    at: '2026-10-08T08:00:00Z',
    entries: [{ entityId: 'rh-aaaaaab2', type: 'unit', before: { label: { he: 'שיחה שניה' } }, after: { label: { he: 'שיחה ב׳' } }, changes: [{ path: '/label', before: { he: 'שיחה שניה' }, after: { he: 'שיחה ב׳' } }], conflicts: [] }],
    timeline: [
      { type: 'event', id: 'opened', at: '2026-10-08T08:00:00Z', actor: 'u-sample', kind: 'opened', detail: {} },
      { type: 'review', id: 7, at: '2026-10-09T08:00:00Z', author: 'u-keeper', verdict: 'approve', body: 'נכון.' },
      { type: 'event', id: 'merged', at: '2026-10-09T08:00:00Z', actor: 'u-keeper', kind: 'merged', detail: {} },
    ],
    reviewRequests: [],
  },
  {
    id: 403,
    number: 44,
    title: 'תוספת הערה לדוגמה',
    description: 'הוספתי הערה שחסרה.',
    author: 'u-sample',
    status: 'open',
    at: '2026-10-09T10:00:00Z',
    entries: [{ entityId: 'rh-aaaaaab3', type: 'segment', before: null, after: { kind: 'note', content: 'הערה חדשה לדוגמה.' }, changes: [{ path: '', after: { kind: 'note', content: 'הערה חדשה לדוגמה.' } }], conflicts: [] }],
    timeline: [{ type: 'event', id: 'opened', at: '2026-10-09T10:00:00Z', actor: 'u-sample', kind: 'opened', detail: {} }],
    reviewRequests: [],
  },
  {
    id: 404,
    number: null,
    title: 'ייבוא לדוגמה',
    description: null,
    author: 'u-keeper',
    status: 'open',
    at: '2026-10-07T10:00:00Z',
    entries: [{ entityId: 'rh-aaaaaab4', type: 'unit', before: { label: { he: 'שיחה רביעית' } }, after: { label: { he: 'שיחה רביעית' }, date: '5732' }, changes: [{ path: '/date', after: '5732' }], conflicts: [] }],
    timeline: [],
    reviewRequests: [],
  },
];

let samples = fresh();
const done: { id: number; what: string; body: unknown }[] = [];

const signedIn = (req: IncomingMessage) => /(?:^|; )rh_session=sample(?:;|$)/.test(req.headers.cookie ?? '');
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};
const listed = (s: Sample) => ({ id: s.id, number: s.number, title: s.title, status: s.status, author: s.author, createdAt: s.at, submittedAt: s.at, comments: s.timeline.filter((i) => i.type === 'comment').length, reviewers: s.reviewRequests.map((r) => r.reviewer), approvals: s.status === 'merged' ? 1 : 0, fixes: [] });
const handleOf = (id: string) => people[id as keyof typeof people]?.username;

/** The merge check: #42 clashes on its name until a choice is made for it. */
function mergeCheck(s: Sample, resolutions: Record<string, Record<string, unknown>> | undefined, signed: boolean) {
  const decided = resolutions?.['rh-aaaaaab1']?.['/label'] ?? null;
  const clashes = s.id === 401 ? [{ entityId: 'rh-aaaaaab1', type: 'unit', path: '/label', base: { he: 'שיחה ראשונה' }, ours: { he: 'שיחה א׳' }, theirs: { he: 'שיחה ראשונה לדוגמה' }, decided }] : [];
  const ready = s.status === 'open' && clashes.every((c) => c.decided);
  return { suggestion: s.id, number: s.number, status: s.status, stage: s.status === 'open' ? (ready ? 'ready' : 'clashes') : s.status, ready, mayApprove: signed, reason: signed ? null : 'sign in to review', items: 1, behind: s.id === 401 ? 1 : 0, approvals: 0, blocking: [], clashes, problems: [], dangling: [], overlaps: [], merged: null, named: { 'rh-aaaaaab1': { type: 'unit', name: 'שיחה ראשונה', path: '/sample/1/1' } }, checkedAt: '2026-10-11T00:00:00Z' };
}

/** Answers a suggestions request and says so; anything else is left to fixture-api.ts. */
export function suggestionsAnswer(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname;
  if (path === '/_suggestions') return send(res, 200, done), true;
  if (path === '/_suggestions/reset') return (samples = fresh()), (done.length = 0), send(res, 200, {}), true;
  const thread = /^\/v1\/threads\/(\d+)$/.exec(path);
  if (thread) {
    const n = Number(thread[1]);
    if (n === 45) return send(res, 200, { kind: 'issue', number: 45, id: 9 }), true;
    const s = samples.find((x) => x.number === n);
    return s ? send(res, 200, { kind: 'suggestion', number: n, id: s.id }) : send(res, 404, { error: 'not-found', message: `#${n} not found` }), true;
  }
  if (path === '/v1/suggestions' && url.searchParams.get('state')) {
    const closed = url.searchParams.get('state') === 'closed';
    const q = url.searchParams.get('q') ?? '';
    const author = url.searchParams.get('author');
    const reviewer = url.searchParams.get('reviewer');
    const rows = samples
      .filter((s) => s.number !== null && (closed ? s.status === 'merged' || s.status === 'withdrawn' : s.status === 'open' || s.status === 'sent_back'))
      .filter((s) => (!q || s.title.includes(q) || `#${s.number}` === q) && (!author || handleOf(s.author) === author) && (!reviewer || s.reviewRequests.some((r) => handleOf(r.reviewer) === reviewer)))
      .sort((a, b) => b.number! - a.number!);
    const counts = { open: samples.filter((s) => s.number && (s.status === 'open' || s.status === 'sent_back')).length, closed: samples.filter((s) => s.number && (s.status === 'merged' || s.status === 'withdrawn')).length };
    return send(res, 200, { suggestions: rows.map(listed), people, counts, next: null }), true;
  }
  if (path === '/v1/suggestions' && url.searchParams.get('status') === 'open') {
    const rows = samples.filter((s) => s.status === 'open').map((s) => ({ id: s.id, number: s.number, title: s.title, author: s.author, status: s.status, created_at: s.at, submitted_at: s.at, items: s.entries.length }));
    return send(res, 200, { suggestions: rows, people, next: null }), true;
  }
  if (path === '/v1/suggestions/stages') {
    const ids = (url.searchParams.get('ids') ?? '').split(',');
    return send(res, 200, { stages: Object.fromEntries(ids.map((id) => [id, { items: 1, behind: id === '401' ? 1 : 0, overlaps: 0, blocked: false }])) }), true;
  }
  const one = /^\/v1\/suggestions\/(\d+)(?:\/([a-z-]+)(?:\/([\w-]+))?)?$/.exec(path);
  const s = one && samples.find((x) => x.id === Number(one[1]));
  if (!one || !s) return false;
  const what = one[2] ?? '';
  const signed = signedIn(req);
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    if (req.method === 'GET' && what === '') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return send(res, 200, {
        changeset: { id: s.id, number: s.number, title: s.title, description: s.description, author: s.author, status: s.status, post_review: null, created_at: s.at, submitted_at: s.at, checks: s.id === 401 ? [{ check: 'schema', status: 'warn', message: 'a date looks unusual' }] : [], checkCounts: { pass: 3, warn: s.id === 401 ? 1 : 0, fail: 0 } },
        entries: s.entries.slice(offset),
        total: s.entries.length,
        offset,
        next: null,
        reviews: s.status === 'merged' ? [{ reviewer: 'u-keeper', verdict: 'approve' }] : [],
        names: Object.fromEntries(Object.entries(people).map(([id, p]) => [id, p.name])),
        people,
        mayApprove: signed && s.status === 'open',
        mayApproveReason: signed ? null : 'sign in to review',
        mine: signed && s.author === 'u-sample',
      });
    }
    if (req.method === 'GET' && what === 'conversation') {
      if (s.number === null) return send(res, 404, { error: 'not-found', message: 'an import has no conversation' });
      return send(res, 200, { number: s.number, timeline: s.timeline, people, reviewRequests: s.reviewRequests, fixes: s.id === 401 ? [{ number: 40, title: 'מילה שגויה לדוגמה', state: 'open', private: false }] : [], subscribed: false });
    }
    if (what === 'merge-check') return send(res, 200, mergeCheck(s, body.resolutions as Record<string, Record<string, unknown>> | undefined, signed));
    if (!signed) return send(res, 401, { error: 'unauthorized', message: 'sign in first' });
    done.push({ id: s.id, what: `${req.method} ${what}${one[3] ? `/${one[3]}` : ''}`, body });
    const at = '2026-10-11T10:00:00Z';
    if (what === 'comments') {
      s.timeline.push({ type: 'comment', id: 100 + done.length, at, author: 'u-sample', body: body.body, hidden: false, parent: body.parent ?? null, anchor: body.anchor ?? null, review: null, resolved: false });
      return send(res, 201, { id: 100 + done.length });
    }
    if (what === 'reviews') {
      const verdict = body.verdict as string;
      if (verdict === 'approve' && s.id === 401 && !(body.resolutions as Record<string, unknown> | undefined)?.['rh-aaaaaab1']) return send(res, 409, { error: 'conflict', message: 'decide each clash first' });
      s.timeline.push({ type: 'review', id: 200 + done.length, at, author: 'u-sample', verdict: verdict === 'request_changes' ? 'send_back' : verdict, body: body.body || null });
      if (verdict === 'approve') s.status = 'merged';
      if (verdict === 'request_changes') s.status = 'sent_back';
      return send(res, 201, {});
    }
    if (what === 'withdraw') return (s.status = 'withdrawn'), send(res, 200, { ok: true });
    if (what === 'reopen') return (s.status = 'open'), send(res, 200, {});
    if (what === 'revert') return send(res, 200, { changeset: 999, commit: 2 });
    if (what === 'update') return send(res, 200, { updated: 1, check: { ...mergeCheck(s, undefined, true), behind: 0, clashes: [], stage: 'ready', ready: true } });
    if (what === 'review-requests') {
      if (req.method === 'DELETE') return (s.reviewRequests = s.reviewRequests.filter((r) => handleOf(r.reviewer) !== one[3])), send(res, 200, { ok: true });
      const handles = (body.reviewers ?? []) as string[];
      for (const handle of handles) {
        const id = Object.entries(people).find(([, p]) => p.username === handle)?.[0];
        if (!id) return send(res, 400, { error: 'invalid', message: `no such user: ${handle}` });
        s.reviewRequests.push({ reviewer: id, requestedBy: 'u-sample', at });
      }
      return send(res, 201, { requested: handles });
    }
    if (req.method === 'PATCH' && what === '') {
      if (typeof body.title === 'string') s.title = body.title;
      if (typeof body.description === 'string') s.description = body.description;
      return send(res, 200, {});
    }
    return send(res, 404, { error: 'not-found', message: 'not found' });
  });
  return true;
}
