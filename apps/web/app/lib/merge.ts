import type { Lang } from './i18n.js';

/**
 * Merging a Suggestion with care, from the browser: the API's merge check
 * (what Approve would do now, changing nothing), the reviewer's choice for
 * each clashing field, and the words for where a Suggestion stands. The
 * calls go through the site's own /_/suggestions, with its session.
 */

export type MergeStage = 'draft' | 'sent_back' | 'blocked' | 'clashes' | 'ready' | 'merged' | 'withdrawn';

/** How a clash is settled, as Approve takes it: the site's version (`ours`), the suggestion's (`theirs`), or a value of one's own. */
export type Resolution = { take: 'ours' } | { take: 'theirs' } | { value: unknown };

export interface MergeClashView {
  entityId: string;
  type: string;
  path: string;
  base?: unknown;
  ours?: unknown;
  theirs?: unknown;
  /** Too long to show whole (a sicha's text): its start is shown, and only a side can be chosen. */
  cut?: boolean;
  withheld?: string;
  decided: Resolution | null;
}

export interface MergeCheckView {
  suggestion: number;
  number: number | null;
  status: 'draft' | 'open' | 'merged' | 'sent_back' | 'withdrawn';
  stage: MergeStage;
  ready: boolean;
  mayApprove: boolean | null;
  reason: string | null;
  items: number;
  behind: number;
  approvals: number;
  blocking: Array<{ check: string; status: string; message: string; entityId?: string }>;
  clashes: MergeClashView[];
  problems: Array<{ kind: string; entityId: string; message: string }>;
  dangling: Array<{ from: string; field: string; to: string }>;
  overlaps: Array<{ id: number; number: number | null; title: string; author: string; status: string; shared: number }>;
  merged: { commit: number | null; at: string | null } | null;
  /** The items it names, by id: their kind, name and page. */
  named: NamedItems;
  checkedAt: string;
}

export type NamedItems = Record<string, { type: string; name: string | null; path: string | null; withheld?: string }>;

export interface ClashProposal {
  entityId: string;
  path: string;
  resolution: Resolution;
  why: string;
}

/** Where each listed suggestion stands (GET /v1/suggestions/stages). */
export interface ListStage {
  items: number;
  behind: number;
  overlaps: number;
  blocked: boolean;
}

/** A clash's key in the reviewer's choices: its item and field. */
export const clashKey = (c: { entityId: string; path: string }) => `${c.entityId}\u0000${c.path}`;

/**
 * The reviewer's choices as Approve takes them: each item's fields, and
 * a choice for all the rest (`*`) when one was made for every clash at once.
 */
export function resolutionsOf(choices: ReadonlyMap<string, Resolution>, all: Resolution | null = null): Record<string, Record<string, Resolution>> {
  const out: Record<string, Record<string, Resolution>> = {};
  if (all) out['*'] = { '*': all };
  for (const [key, resolution] of choices) {
    const [entityId, path] = key.split('\u0000') as [string, string];
    (out[entityId] ??= {})[path] = resolution;
  }
  return out;
}

/** Which side a resolution takes, for a radio group: the site's, the suggestion's, or one's own words. */
export function sideOf(resolution: Resolution | null | undefined): 'ours' | 'theirs' | 'own' | null {
  if (!resolution) return null;
  return 'take' in resolution ? resolution.take : 'own';
}

/** A value as one edits it by hand: words as they are, anything else as JSON. */
export function editable(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

/** What was typed, read back as the field's kind: words stay words; anything else must be JSON of the same kind. */
export function readTyped(text: string, like: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof like === 'string' || like === undefined) return { ok: true, value: text };
  try {
    const value = JSON.parse(text) as unknown;
    const kind = (v: unknown) => (Array.isArray(v) ? 'list' : v === null ? 'null' : typeof v);
    return like === null || kind(value) === kind(like) ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

const STAGES: Record<MergeStage, { he: string; en: string }> = {
  draft: { he: 'טיוטה', en: 'Draft' },
  sent_back: { he: 'הוחזרה למציע', en: 'Sent back to its author' },
  blocked: { he: 'נעצרה: יש מה לתקן', en: 'Stopped: something to fix' },
  clashes: { he: 'מחכה להחלטה על התנגשויות', en: 'Clashes need a decision' },
  ready: { he: 'מוכנה למיזוג', en: 'Ready to merge' },
  merged: { he: 'מוזגה ונכנסה לספרייה', en: 'Merged into the library' },
  withdrawn: { he: 'בוטלה', en: 'Withdrawn' },
};

export const stageWords = (stage: MergeStage, lang: Lang) => STAGES[stage][lang];

/** A list row's stage, from what the list knows without reading the suggestion whole. */
export function listStage(stage: ListStage | undefined, lang: Lang): { tone: 'ok' | 'attention' | 'closed' | 'open'; words: string } | null {
  if (!stage) return null;
  if (stage.blocked) return { tone: 'closed', words: lang === 'he' ? 'נעצרה בבדיקה' : 'Stopped by a check' };
  if (stage.behind > 0) return { tone: 'attention', words: lang === 'he' ? `${stage.behind} השתנו באתר מאז` : `${stage.behind} changed on the site since` };
  if (stage.overlaps > 0) return { tone: 'attention', words: lang === 'he' ? `משותפת עם ${stage.overlaps} הצעות` : `Shares items with ${stage.overlaps} other${stage.overlaps === 1 ? '' : 's'}` };
  return { tone: 'ok', words: lang === 'he' ? 'נקייה' : 'Merges cleanly' };
}

/** The steps a suggestion goes through, each done, current, stopped or still to come, for the stage strip. */
export function stageSteps(check: Pick<MergeCheckView, 'stage' | 'status' | 'blocking' | 'problems' | 'clashes' | 'behind' | 'approvals'>, lang: Lang) {
  type Step = { key: string; words: string; state: 'done' | 'now' | 'stopped' | 'todo' };
  const he = lang === 'he';
  const merged = check.stage === 'merged';
  const sent = check.status !== 'draft';
  const checksOk = check.blocking.length === 0 && check.problems.length === 0;
  const undecided = check.clashes.filter((c) => c.decided === null).length;
  const steps: Step[] = [
    { key: 'sent', words: he ? 'נשלחה' : 'Sent', state: sent ? 'done' : 'now' },
    { key: 'checks', words: he ? 'בדיקות' : 'Checks', state: merged || (sent && checksOk) ? 'done' : sent ? 'stopped' : 'todo' },
    {
      key: 'clashes',
      words: undecided ? (he ? `${undecided} התנגשויות` : `${undecided} clash${undecided === 1 ? '' : 'es'}`) : he ? 'בלי התנגשויות' : 'No clashes',
      state: merged || (sent && checksOk && !undecided) ? 'done' : sent && checksOk ? 'now' : 'todo',
    },
    { key: 'review', words: he ? 'אישור' : 'Approval', state: merged ? 'done' : check.stage === 'ready' ? 'now' : 'todo' },
    { key: 'merged', words: he ? 'בספרייה' : 'In the library', state: merged ? 'done' : 'todo' },
  ];
  if (check.status === 'sent_back') steps[3] = { key: 'review', words: he ? 'הוחזרה' : 'Sent back', state: 'stopped' };
  return steps;
}

async function call<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  const response = await fetch(`/_/suggestions${path}`, {
    method: init?.method ?? 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw Object.assign(new Error(json.message ?? response.statusText), { status: response.status });
  return json;
}

export const mergeApi = {
  check: (id: number, resolutions?: Record<string, Record<string, Resolution>>) => call<MergeCheckView>(`/${id}/merge-check`, resolutions ? { method: 'POST', body: { resolutions } } : undefined),
  update: (id: number, resolutions: Record<string, Record<string, Resolution>>) => call<{ updated: number; check: MergeCheckView }>(`/${id}/update`, { method: 'POST', body: { resolutions } }),
  ai: (id: number, resolutions: Record<string, Record<string, Resolution>>) => call<{ proposals: ClashProposal[]; asked: number; left: number; model: string }>(`/${id}/resolve-ai`, { method: 'POST', body: { resolutions } }),
  approve: (id: number, resolutions: Record<string, Record<string, Resolution>>, note?: string) => call<{ commit: number | null }>(`/${id}/approve`, { method: 'POST', body: { resolutions, note } }),
  stages: (ids: number[]) => (ids.length ? call<{ stages: Record<string, ListStage> }>(`/stages?ids=${ids.join(',')}`) : Promise.resolve({ stages: {} })),
};
