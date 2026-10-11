import { compare, plainOf, type Piece } from '../back/words.js';

/**
 * A Suggestion as its pages show it (thread 6, the rebuild): what the API's
 * GET /v1/suggestions/:id?brief=1 says, made small and plain on the server, so
 * a page carries each change's words compared and each other field's value
 * before and after, never an item's whole text. The same on the server and in
 * the browser (after Bring up to date, the browser reads it again).
 */

export type Status = 'draft' | 'open' | 'merged' | 'sent_back' | 'withdrawn';

/** A Suggestion's people, by account id: their name, their handle and whether they are a bot. */
export type People = Record<string, { name?: string; username?: string | null; bot?: boolean }>;

/** Sent by an agent for its author: one of their API tokens, or an app they connected. */
export interface Via {
  kind: 'token' | 'oauth';
  name: string;
}

/** One field a Suggestion changes, as a reviewer reads it. */
export type FieldView =
  | { kind: 'words'; path: string; name: string; pieces: Piece[] }
  | { kind: 'value'; path: string; name: string; before: string; after: string }
  /** A new item's own facts, each as it will be. */
  | { kind: 'fact'; path: string; name: string; value: string }
  | { kind: 'more'; count: number };

/** One item a Suggestion changes. */
export interface EntryView {
  id: string;
  type: string;
  /** Its kind in words ("שיחה", "פסקה"). */
  kind: string;
  /** Its name, when its facts carry one. */
  label: string | null;
  isNew: boolean;
  removed: boolean;
  /** Its words are kept back for rights: read them on the site. */
  withheld: boolean;
  /** Its fields that changed, a few at most. */
  fields: FieldView[];
}

/** What the API checked: how many passed, and each that did not. */
export interface Checks {
  passed: number;
  problems: { status: 'warn' | 'fail'; message: string }[];
  /** Problems on items past this page of them. */
  more: number;
}

/** A Suggestion as its page shows it. */
export interface SuggestionView {
  id: number;
  number: number | null;
  title: string;
  description: string | null;
  author: string;
  via: Via | null;
  status: Status;
  /** Live already, waiting to be kept or undone in the back room. */
  live: boolean;
  createdAt: string | null;
  submittedAt: string | null;
  projectId: number | null;
  entries: EntryView[];
  /** How many items it changes in all, and where the next page of them starts (null: none). */
  total: number;
  next: number | null;
  checks: Checks;
  approvals: number;
  people: People;
  /** As the person asking: whether they may approve it, and why not; whether they wrote it. */
  mayApprove: boolean;
  mayApproveReason: string | null;
  mine: boolean;
}

type D = Record<string, unknown>;
const isObject = (value: unknown): value is D => !!value && typeof value === 'object' && !Array.isArray(value);

/** A name as the catalog keeps it ({ he, en } or words), in Hebrew where it has it. */
export function nameText(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (isObject(value)) {
    for (const key of ['he', 'en']) if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  }
  return null;
}

const TYPES: Record<string, string> = {
  unit: 'שיחה',
  segment: 'פסקה',
  text: 'טקסט',
  work: 'ספר',
  set: 'מדף',
  event: 'התוועדות',
  recording: 'הקלטה',
  publication: 'הדפסה',
  scan: 'סריקה',
  'contents-map': 'מפתח עמודים',
  person: 'אדם',
  place: 'מקום',
  translation: 'תרגום',
  file: 'קובץ',
};
export const typeName = (type: string) => TYPES[type] ?? 'פריט';

const FIELDS: Record<string, string> = {
  name: 'שם',
  title: 'כותרת',
  label: 'שם',
  date: 'תאריך',
  content: 'המילים',
  text: 'המילים',
  body: 'הטקסט',
  notes: 'הערות',
  position: 'מקום בספר',
  work: 'ספר',
  unit: 'שיחה',
  parent: 'מקום',
  sets: 'מדפים',
  pages: 'עמודים',
  page: 'עמוד',
  publication: 'הדפסה',
  editions: 'קבצים',
  language: 'שפה',
  kind: 'סוג',
  order: 'סדר',
  slug: 'כתובת',
  url: 'קישור',
  media: 'קישור',
  audio: 'שמע',
  startMs: 'זמן',
  endMs: 'זמן',
  origin: 'מקור',
  proofread: 'בדיקה',
  hebrewDate: 'תאריך עברי',
  description: 'תיאור',
};

/** A field's place in words: the last part of its path that has a name, else the path itself. */
export function fieldName(path: string): string {
  if (path === '' || path === '/') return 'הפריט כולו';
  const parts = path.split('/').filter(Boolean);
  for (let at = parts.length - 1; at >= 0; at--) {
    const said = FIELDS[parts[at]!];
    if (said) return said;
  }
  return path;
}

/** A value that is not words, short enough to read in a line. */
export function valueText(value: unknown): string {
  if (value === undefined) return '(ריק)';
  if (value === null) return '(נמחק)';
  if (typeof value === 'string') return value || '(ריק)';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const name = nameText(value);
  if (name) return name;
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) return value.join(', ');
  const json = JSON.stringify(value);
  return json.length > 160 ? `${json.slice(0, 157)}…` : json;
}

const cut = (text: string, at: number) => (text.length > at ? `${text.slice(0, at - 1)}…` : text);

/** How many fields of one item are shown; the rest are counted. */
const FIELDS_SHOWN = 8;

interface RawEntry {
  entityId: string;
  type: string;
  before?: unknown;
  after?: unknown;
  changes?: { path: string; before?: unknown; after?: unknown }[];
  withheld?: string;
}

/** One item's change as its page shows it: its words compared, its other fields before and after. */
export function entryView(entry: RawEntry): EntryView {
  const facts = (isObject(entry.after) ? entry.after : isObject(entry.before) ? entry.before : {}) as D;
  const label = nameText(facts.name) ?? nameText(facts.title) ?? nameText(facts.label);
  const isNew = entry.before === null;
  const removed = entry.after === null;
  const fields: FieldView[] = [];
  // A new item is its facts, and one taken out its header: neither is a list of fields to compare.
  const changes = isNew || removed ? [] : (entry.changes ?? []);
  for (const change of changes.slice(0, FIELDS_SHOWN)) {
    const before = plainOf(change.before);
    const after = plainOf(change.after);
    const name = fieldName(change.path);
    // Words are compared when both sides are words, and long enough to be more than a name.
    if (before !== null && after !== null && (before.length > 40 || after.length > 40 || /content|text|body/.test(change.path))) {
      fields.push({ kind: 'words', path: change.path, name, pieces: compare(before, after) });
    } else fields.push({ kind: 'value', path: change.path, name, before: valueText(change.before), after: valueText(change.after) });
  }
  if (changes.length > FIELDS_SHOWN) fields.push({ kind: 'more', count: changes.length - FIELDS_SHOWN });
  // A new item: what it will hold, its facts one by one (a whole text is read on its page once it is in).
  if (isNew && !entry.withheld) {
    const facts = Object.entries(isObject(entry.after) ? entry.after : {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
    for (const [key, value] of facts.slice(0, FIELDS_SHOWN)) fields.push({ kind: 'fact', path: `/${key}`, name: fieldName(`/${key}`), value: cut(plainOf(value) ?? valueText(value), 300) });
    if (facts.length > FIELDS_SHOWN) fields.push({ kind: 'more', count: facts.length - FIELDS_SHOWN });
  }
  return { id: entry.entityId, type: entry.type, kind: typeName(entry.type), label, isNew, removed, withheld: Boolean(entry.withheld), fields };
}

/** GET /v1/suggestions/:id?brief=1 made small: what a Suggestion's page needs, and nothing of the items' whole texts. */
export function suggestionView(raw: Record<string, unknown>): SuggestionView {
  const cs = (raw.changeset ?? {}) as D;
  const counts = (cs.checkCounts ?? { pass: 0, warn: 0, fail: 0 }) as { pass: number; warn: number; fail: number };
  const listed = ((cs.checks ?? []) as { status?: string; message?: string }[]).filter((c) => c.status === 'warn' || c.status === 'fail');
  const reviews = (raw.reviews ?? []) as { verdict?: string }[];
  const names = (raw.names ?? {}) as Record<string, string>;
  const people: People = { ...Object.fromEntries(Object.entries(names).map(([id, name]) => [id, { name }])), ...((raw.people ?? {}) as People) };
  const entries = ((raw.entries ?? []) as RawEntry[]).map(entryView);
  return {
    id: Number(cs.id),
    number: typeof cs.number === 'number' ? cs.number : null,
    title: String(cs.title ?? ''),
    description: typeof cs.description === 'string' && cs.description ? cs.description : null,
    author: String(cs.author ?? ''),
    via: isObject(cs.via) && typeof cs.via.name === 'string' ? { kind: cs.via.kind === 'oauth' ? 'oauth' : 'token', name: cs.via.name } : null,
    status: (cs.status as Status) ?? 'open',
    live: cs.post_review === 'pending',
    createdAt: typeof cs.created_at === 'string' ? cs.created_at : null,
    submittedAt: typeof cs.submitted_at === 'string' ? cs.submitted_at : null,
    projectId: typeof cs.project_id === 'number' ? cs.project_id : null,
    entries,
    total: typeof raw.total === 'number' ? raw.total : entries.length,
    next: typeof raw.next === 'number' ? raw.next : null,
    checks: {
      passed: counts.pass,
      problems: listed.map((c) => ({ status: c.status as 'warn' | 'fail', message: String(c.message ?? '') })),
      more: Math.max(0, counts.warn + counts.fail - listed.length),
    },
    approvals: reviews.filter((r) => r.verdict === 'approve').length,
    people,
    // The API says it as true or false (older answers as { ok }).
    mayApprove: raw.mayApprove === true || (isObject(raw.mayApprove) && raw.mayApprove.ok === true),
    mayApproveReason: typeof raw.mayApproveReason === 'string' ? raw.mayApproveReason : null,
    mine: raw.mine === true,
  };
}

/** Where a Suggestion stands, in words, as its list and its page say it. */
export function statusWords(status: Status, live = false): string {
  if (live) return 'עלתה לאתר, ממתינה לבדיקה אחרי';
  switch (status) {
    case 'merged':
      return 'אושרה ונכנסה לספרייה';
    case 'sent_back':
      return 'הוחזרה עם הערה';
    case 'withdrawn':
      return 'נסגרה';
    case 'draft':
      return 'טיוטה';
    default:
      return 'ממתינה לבדיקה';
  }
}

/** Still open to decide: waiting for review, or sent back to its author. */
export const isOpen = (status: Status) => status === 'open' || status === 'sent_back';

// ---------------------------------------------------------------- the conversation

export type TimelineItem =
  | { type: 'comment'; id: number; at: string; author: string; body: string | null; hidden: boolean; parent: number | null; anchor: { entity: string; field: string } | null; review: number | null; resolved: boolean; via?: Via | null }
  | { type: 'review'; id: number; at: string; author: string; verdict: 'approve' | 'send_back' | 'comment'; body: string | null; via?: Via | null }
  | { type: 'event'; id: string; at: string; actor: string | null; kind: string; detail: Record<string, unknown> };

/** A Suggestion's conversation (GET /v1/suggestions/:id/conversation): what was said and done, who is asked to review, the reports it fixes. */
export interface Conversation {
  timeline: TimelineItem[];
  people: People;
  reviewRequests: { reviewer: string; requestedBy: string | null; at: string }[];
  fixes: { number: number; title: string | null; state: 'open' | 'closed'; private: boolean }[];
}

export function conversationOf(raw: Record<string, unknown> | null): Conversation | null {
  if (!raw) return null;
  return {
    timeline: (raw.timeline ?? []) as TimelineItem[],
    people: (raw.people ?? {}) as People,
    reviewRequests: (raw.reviewRequests ?? []) as Conversation['reviewRequests'],
    fixes: ((raw.fixes ?? []) as Conversation['fixes']).filter((f) => !f.private),
  };
}

/** A person's name as a page shows it: their name, else their handle, else their id. */
export const personName = (id: string | null | undefined, people: People) => (id ? (people[id]?.name ?? people[id]?.username ?? id) : 'האתר');

/** What happened, in words: the Suggestion is the subject, so no word needs to know who did it. */
export function eventWords(kind: string, detail: Record<string, unknown>, people: People): string | null {
  const who = (list: unknown) => (Array.isArray(list) ? list.map((id) => personName(String(id), people)).join(', ') : '');
  switch (kind) {
    case 'opened':
      return null;
    case 'submitted':
      return detail.live ? 'עלתה לאתר מיד, ותיבדק אחרי' : 'נשלחה לבדיקה';
    case 'sent_back':
      return 'הוחזרה למציע';
    case 'merged':
      return 'אושרה ונכנסה לספרייה';
    case 'withdrawn':
      return 'נסגרה';
    case 'reverted': {
      const by = (detail.by ?? detail.revert) as { number?: number } | undefined;
      return by?.number ? `השינוי בוטל (#${by.number})` : 'השינוי בוטל';
    }
    case 'reopened':
      return 'נפתחה מחדש';
    case 'renamed':
      return `הכותרת שונתה ל„${String(detail.to ?? '')}”`;
    case 'edited':
      return detail.upToDate ? 'עודכנה מול האתר' : 'התיאור נערך';
    case 'review_requested':
      return `התבקשה בדיקה מ${who(detail.reviewers)}`;
    case 'review_request_removed':
      return `הבקשה לבדיקה מ${who(detail.reviewers)} הוסרה`;
    case 'referenced': {
      const from = detail.from as { kind?: string; number?: number | null } | undefined;
      return from?.number ? `הוזכרה ב־#${from.number}` : 'הוזכרה';
    }
    default:
      return null;
  }
}

/** What a review decided, in words. */
export const verdictWords = { approve: 'אישור', send_back: 'החזרה עם הערה', comment: 'הערות' } as const;

/** A comment's words, its #numbers and @handles as links (to a suggestion or issue, to a person). */
export function linkParts(text: string): ({ text: string } | { text: string; to: string })[] {
  const parts: ({ text: string } | { text: string; to: string })[] = [];
  const pattern = /(^|[\s(])(#(\d{1,9})|@([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?))(?=$|[\s.,:;!?)])/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[1]!.length;
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push({ text: match[2]!, to: match[3] ? `/suggestions/${match[3]}` : `/u/${match[4]}` });
    at = start + match[2]!.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** The days and times on these pages, as people in Israel read them (the same on the server and in the browser). */
const DAY = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });
const DAY_TIME = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
export const dayOf = (iso: string | null | undefined) => (iso ? DAY.format(new Date(iso)) : '');
export const momentOf = (iso: string | null | undefined) => (iso ? DAY_TIME.format(new Date(iso)) : '');

/** A Suggestion's own address: its #number, or (an import, which has none) its id. */
export const suggestionPath = (s: { id: number; number?: number | null }) => (s.number ? `/suggestions/${s.number}` : `/suggestions/i${s.id}`);

/** Where one stands on its way in (GET /v1/suggestions/stages): items, changed on the site since, shared with others, stopped by a check. */
export interface Stage {
  items: number;
  behind: number;
  overlaps: number;
  blocked: boolean;
}

/** A line's stage, in words: what a keeper wants to know before opening it. */
export function stageWords(stage: Stage | undefined): string | null {
  if (!stage) return null;
  if (stage.blocked) return 'נעצרה בבדיקה';
  if (stage.behind > 0) return `${stage.behind} השתנו באתר מאז`;
  if (stage.overlaps > 0) return stage.overlaps === 1 ? 'משותפת עם הצעה אחרת' : `משותפת עם ${stage.overlaps} הצעות`;
  return 'נכנסת בלי התנגשויות';
}
