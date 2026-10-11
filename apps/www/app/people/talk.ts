/**
 * People and their conversations, as the browser and the pages see them:
 * reports (the API's issues), the inbox and a person's page. The API's
 * answers (core's issues, inbox and profiles) are typed here as these pages
 * read them, and personal reads go through the site's own /_/people/*
 * (routes/people-pass.ts), so the session cookie is the site's.
 */

export interface PersonTag {
  name: string;
  username: string | null;
  bot?: boolean;
}

/** Everyone a list or a report names, by id. */
export type People = Record<string, PersonTag>;

export interface IssueLabel {
  name: string;
  description?: string | null;
  color?: string;
}

export interface Issue {
  id: number;
  number: number;
  title?: string | null;
  typeTitle?: { he?: string; en?: string };
  type: string;
  state: 'open' | 'closed';
  stateReason?: 'completed' | 'not_planned' | null;
  body?: string | null;
  private: boolean;
  author?: string | null;
  entity?: { id: string; type?: string; path?: string | null; name?: unknown } | null;
  labels: IssueLabel[];
  assignees: string[];
  comments?: number;
  createdAt: string;
  closedAt?: string | null;
  closedBy?: string | null;
  closedBySuggestion?: number | null;
}

/** A report as a list shows it: everything but its words, which are read on its own page. */
export type IssueRow = Omit<Issue, 'body'>;

export interface IssueRights {
  read: boolean;
  comment: boolean;
  edit: boolean;
  close: boolean;
  triage: boolean;
  moderate: boolean;
}

export type TimelineItem =
  | { type: 'comment'; id: number; at: string; author: string; body: string | null; hidden: boolean; parent?: number | null; edited?: boolean }
  | { type: 'review'; id: number; at: string; author: string; verdict: string; body: string | null }
  | { type: 'event'; id: string; at: string; actor: string | null; kind: string; detail: Record<string, unknown> };

export interface IssueDetail {
  issue: Issue;
  rights?: IssueRights;
  timeline?: TimelineItem[];
  people?: People;
  fixedBy?: { number: number; title: string; status: string }[];
  subscribed?: boolean;
}

export interface IssueTemplate {
  type: string;
  label: { he?: string; en?: string };
  template: { he?: string; en?: string };
  private?: boolean;
}

export interface InboxLine {
  id: number;
  reason: 'mention' | 'review_requested' | 'assigned' | 'author' | 'comment' | 'review' | 'state' | 'followed';
  subject: { kind: 'changeset' | 'report' | 'entity' | 'project'; id: string; number: number | null; title: string | null; state: string | null; path: string | null; name?: unknown };
  actorName?: string | null;
  actorUsername?: string | null;
  count: number;
  at: string;
  read: boolean;
}

export interface Profile {
  person: { id: string; username: string; displayName: string; since: string; steward?: boolean; admin?: boolean; trust?: string; suspended?: boolean };
  movedFrom?: string;
  counts: { suggestions: number; merged: number; reviews: number; issues: number; comments: number };
  activity: {
    kind: 'suggestion' | 'review' | 'issue' | 'comment';
    at: string;
    thread: { kind: 'changeset' | 'report' | 'entity'; id: string; number: number | null; title: string | null; state: string | null; path: string | null };
    excerpt?: string;
  }[];
}

/** A refusal from the API through /_/people, with its status. */
export class PeopleError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the API as the person, through /_/people/…; throws its status when it says no. */
export async function asPerson<T>(path: string, init?: { method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/_/people/${path}`, {
      method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new PeopleError(0, 'down');
  }
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new PeopleError(response.status, json.message ?? response.statusText);
  return json;
}

/** What a failed step says, in Hebrew. */
export function saidOf(error: unknown): string {
  const status = error instanceof PeopleError ? error.status : 0;
  if (status === 401) return 'צריך להיכנס קודם.';
  if (status === 403) return 'אין לכם הרשאה לעשות את זה.';
  if (status === 404) return 'לא נמצא. אולי הוא נמחק או הוסתר.';
  if (status === 429) return 'יותר מדי בבת אחת. נסו שוב בעוד רגע.';
  if (status === 0 || status >= 500) return 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.';
  return 'משהו השתבש. נסו שוב.';
}

/** The labels' names in Hebrew; a label the site does not know keeps its own name. */
const LABELS: Record<string, string> = {
  text: 'טקסט',
  source: 'מראה מקום',
  scan: 'סריקה',
  date: 'תאריך',
  meta: 'פרטים',
  audio: 'הקלטה',
  translation: 'תרגום',
  sync: 'סנכרון',
  printing: 'הדפסה',
  rights: 'זכויות',
  duplicate: 'כפילות',
};
export const labelName = (name: string): string => LABELS[name] ?? name;

/** The kinds of report, in Hebrew, for when the API's own title of a kind is missing. */
const KINDS: Record<string, string> = {
  'wrong-fact': 'פרט שגוי',
  'missing-page': 'עמוד חסר',
  'bad-scan': 'סריקה פגומה',
  'audio-problem': 'בעיה בהקלטה',
  'wrong-text': 'טעות בטקסט',
  duplicate: 'כפילות',
  rights: 'זכויות',
  offensive: 'תוכן פוגע',
  other: 'אחר',
};
export const kindName = (issue: { type: string; typeTitle?: { he?: string } }): string => issue.typeTitle?.he || KINDS[issue.type] || issue.type;

/** A report's title, or its kind when it has none. */
export const titleOf = (issue: Pick<Issue, 'title' | 'type' | 'typeTitle'>): string => issue.title?.trim() || kindName(issue);

/** An item's name in Hebrew, or in whatever language it has. */
export const nameOf = (name: unknown): string => {
  if (typeof name === 'string') return name;
  const names = (name ?? {}) as Record<string, unknown>;
  return String(names.he ?? names.en ?? Object.values(names)[0] ?? '');
};

/** Where a report's item is on the site: its readable path, or its permanent one. */
export const itemHref = (entity: { id: string; path?: string | null }): string => entity.path || `/${entity.id}`;

/** Where a conversation is on the site: a suggestion, a report, or the item it is about. */
export function threadHref(kind: string, number: number | null, id: string, path?: string | null): string | null {
  if (kind === 'changeset') return number ? `/suggestions/${number}` : null;
  if (kind === 'report') return number ? `/issues/${number}` : '/issues';
  if (kind === 'entity') return path || `/${id}`;
  return path ?? null;
}

const dayFormat = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('he', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "11 באוקטובר 2026": the same on the server and in the browser, so nothing changes when the page wakes. */
export const day = (iso: string | null | undefined): string => (iso ? dayFormat.format(new Date(iso)) : '');
export const month = (iso: string): string => monthFormat.format(new Date(iso));

/** A person's name, by id, from the people a page was given. */
export const personName = (people: People, id: string | null | undefined): string => (id ? (people[id]?.name ?? id) : 'אורח');

/**
 * Words as written in a report or a comment, cut into plain text and links:
 * #12 to that report or suggestion (the site sends a suggestion's number on),
 * @handle to that person's page. Nothing else is read as markup.
 */
export function pieces(text: string): ({ text: string } | { text: string; to: string })[] {
  const out: ({ text: string } | { text: string; to: string })[] = [];
  const pattern = /(^|[\s(\u05be])(#(\d{1,9})|@([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?))(?![\w-])/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index! + match[1]!.length;
    if (start > at) out.push({ text: text.slice(at, start) });
    out.push({ text: match[2]!, to: match[3] ? `/issues/${match[3]}` : `/u/${match[4]}` });
    at = start + match[2]!.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
