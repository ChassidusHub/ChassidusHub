/*
 * What an item's tool pages share in the browser and on the server (thread 6,
 * "item tools"): an item's versions, its talk page, a file's page, a scan's
 * text, printings compared, a sefer's shaar and the subject index. Dates and
 * sizes said in Hebrew, words compared one by one, and the plain text of a
 * value a version changed.
 */

const day = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', year: 'numeric' });

/** "11 באוקטובר 2026": the day of a change, a comment or a file, the same on the server and in the browser. */
export const dayOf = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : day.format(at);
};

/** A file's size: 1.4 MB. */
export function sizeOf(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/** What an item is, in a word. */
export const KINDS: Record<string, string> = {
  set: 'מדף',
  work: 'ספר',
  unit: 'דף',
  publication: 'דפוס',
  scan: 'סריקה',
  recording: 'הקלטה',
  event: 'התוועדות',
  text: 'טקסט',
  person: 'אדם',
};

/** One piece of a text compared with another: the same in both, only in the first (taken out), or only in the second (added). */
export interface Piece {
  kind: 'same' | 'del' | 'ins';
  text: string;
}

/** More words than this on either side, and the two are shown whole, one after the other, rather than word by word. */
const MOST_WORDS = 1200;

/**
 * Two texts word by word: the longest run of words they share kept as it is,
 * what only the first has taken out and what only the second has added.
 * Spaces stay with the word before them, so the pieces read back as the text.
 */
export function wordDiff(before: string, after: string): Piece[] {
  const words = (text: string) => (text ? text.split(/(?<=\s)(?=\S)/) : []);
  const a = words(before);
  const b = words(after);
  if (before === after) return before ? [{ kind: 'same', text: before }] : [];
  if (a.length > MOST_WORDS || b.length > MOST_WORDS) return [...(before ? [{ kind: 'del' as const, text: before }] : []), ...(after ? [{ kind: 'ins' as const, text: after }] : [])];
  const key = (word: string) => word.trim();
  // The common words from each place on: lengths[i][j] for a[i..] and b[j..].
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] = key(a[i]!) === key(b[j]!) ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const pieces: Piece[] = [];
  const add = (kind: Piece['kind'], text: string) => {
    const last = pieces.at(-1);
    if (last?.kind === kind) last.text += text;
    else pieces.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]!) === key(b[j]!)) {
      // The same word, perhaps with a space after it on one side only: kept with one, so neither side runs into the next word.
      add('same', a[i] === b[j] ? a[i]! : `${key(a[i]!)}${/\s$/.test(a[i]!) || /\s$/.test(b[j]!) ? ' ' : ''}`);
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) add('del', a[i++]!);
    else add('ins', b[j++]!);
  }
  while (i < a.length) add('del', a[i++]!);
  while (j < b.length) add('ins', b[j++]!);
  return pieces;
}

/** The words of a value a version changed: a page's runs ({ text }), a name in Hebrew, or the value itself. */
export function plainText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.every((run) => run && typeof run === 'object' && !Array.isArray(run) && ('text' in run || 'note' in run || 'br' in run || 'marker' in run || 'eol' in run))) {
      return value.map((run: { text?: unknown; br?: unknown }) => (typeof run.text === 'string' ? run.text : run.br ? '\n' : '')).join('');
    }
    return value.map(plainText).join(', ');
  }
  const named = value as Record<string, unknown>;
  if (typeof named.he === 'string') return named.he;
  if (typeof named.text === 'string' || Array.isArray(named.text)) return plainText(named.text);
  return JSON.stringify(value);
}

/** The words people use for an item's fields, for the field a change is in. */
const FIELDS: Array<[RegExp, string]> = [
  [/^\/(label|title|name)(\/|$)/, 'השם'],
  [/^\/(body|text|segments|notes)(\/|$)/, 'המילים'],
  [/^\/date(\/|$)/, 'התאריך'],
  [/^\/(work|event|publication|parent|sets)(\/|$)/, 'המקום בקטלוג'],
  [/^\/(position|order)(\/|$)/, 'הסדר'],
  [/^\/(editions|file|url|files)(\/|$)/, 'הקבצים'],
  [/^\/shaar(\/|$)/, 'השער'],
  [/^\/(authors|by)(\/|$)/, 'המחבר'],
];

/** The field a change is in, in a word: "השם", "המילים", else its own name. */
export function fieldOf(path: string): string {
  for (const [pattern, word] of FIELDS) if (pattern.test(path)) return word;
  return path.replace(/^\//, '').split('/')[0] || 'הדף';
}

/** One change of a version, as the API gives it: the field, and its value before and after. */
export interface Change {
  path: string;
  before?: unknown;
  after?: unknown;
}

/** One version of an item, newest first in GET /v1/entities/{id}/history. */
export interface Version {
  commit: number;
  at: string;
  message: string;
  mergedBy: string;
  mergedByName: string | null;
  author: string;
  authorName: string | null;
  authorIsBot: boolean;
  rev: number;
  deleted: boolean;
  created: boolean;
  changes: Change[];
}

/**
 * What changed from one version to a later one: each field's value before
 * the first change after `older`, and after the last one up to `newer`. Null
 * when the two cannot be compared field by field (the item was made or taken
 * out between them, or one change holds another's field inside it).
 */
export function between(history: Version[], older: number, newer: number): Change[] | null {
  const at = (rev: number) => history.findIndex((h) => h.rev === rev);
  const from = at(older);
  const to = at(newer);
  if (from < 0 || to < 0 || to >= from) return [];
  // Newest first: the versions after `older`, up to and with `newer`, oldest of them first.
  const span = history.slice(to, from).reverse();
  if (span.some((h) => h.created || h.deleted)) return null;
  const fields = new Map<string, Change>();
  for (const version of span) {
    for (const change of version.changes) {
      const was = fields.get(change.path);
      fields.set(change.path, { path: change.path, before: was ? was.before : change.before, after: change.after });
    }
  }
  const paths = [...fields.keys()];
  if (paths.some((p) => paths.some((q) => q !== p && q.startsWith(`${p}/`)))) return null;
  return [...fields.values()].filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after));
}

/** Answers from the item tools' writes (routes/tools-act.ts). */
export type ToolAnswer = ({ ok: true } & Record<string, unknown>) | { ok: false; why: 'signin' | 'refused' | 'changed' | 'busy' | 'down' | 'problems'; message?: string; problems?: { line: number; he: string }[] };

/** Why a write did not go, in Hebrew. */
export const WHY: Record<Exclude<ToolAnswer, { ok: true }>['why'], string> = {
  signin: 'כדי לעשות את זה צריך להיכנס.',
  refused: 'לא אפשר לעשות את זה כאן.',
  changed: 'הדף השתנה מאז שפתחתם אותו. טענו אותו מחדש.',
  busy: 'יותר מדי בבת אחת. נסו שוב עוד רגע.',
  down: 'לא הצלחנו לשלוח. נסו שוב.',
  problems: 'יש שורות שהקטלוג לא יודע לקרוא.',
};

/**
 * Sends one of the item tools' writes as the person (routes/tools-act.ts):
 * a comment, a restore, a line fixed, a page confirmed, a shaar. Answers
 * what the action answered, or why it could not be sent.
 */
export async function act(what: string, body: unknown): Promise<ToolAnswer> {
  try {
    const response = await fetch(`/_/tools/${what}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    return ((await response.json().catch(() => null)) as ToolAnswer | null) ?? { ok: false, why: 'down' };
  } catch {
    return { ok: false, why: 'down' };
  }
}

/** A refusal's words: the API's own message when it gave one the person can use, else why in general. */
export const said = (answer: Exclude<ToolAnswer, { ok: true }>) => WHY[answer.why];
