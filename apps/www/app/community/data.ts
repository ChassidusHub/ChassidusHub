import { describeDateKey, toHebrewNumeral } from '@chassidushub/hebrew';

/**
 * What the pages about the catalog as a whole read from the API (thread 6's
 * rebuild of the old site's project pages): its health, the Missing board,
 * the projects working through its gaps, and the downloads. The client's
 * types leave these answers open, so their shapes are written here, as the
 * API gives them (packages/core: health.ts, projectWork.ts; services/api:
 * mirrors.ts).
 */

export type Name = { he?: string; en?: string } | string | null | undefined;

/** GET /v1/health. */
export interface CatalogHealth {
  years: Array<{ year: number; events: number; withRecording: number; withText: number; withTranscript: number }>;
  sets: Array<{ id: string; path: string | null; name: Name; items: number; byType: Record<string, number> }>;
  pages: { total: number; checked: number };
  uncheckedScans: Array<{ scan: string; publication: string | null; title: Name; pages: number; checked: number }>;
  recordings: { total: number; transcribed: number; synced: number };
  unsynced: Array<{ id: string; path: string | null; title: Name; event: string | null }>;
  openSuggestions: Array<{ id: number; title: string; author: string; authorName: string; authorIsBot: boolean; submittedAt: string }>;
  links: { checked: number; dead: number; lastChecked: string | null };
  deadLinks: Array<{ url: string; status: number | null; error: string | null; checkedAt: string; failingSince: string | null; entities: string[] }>;
  embeddings: { embedded: number; waiting: number };
}

export type Gap = 'recordings' | 'texts' | 'sync' | 'proofreading';

/** One project, as GET /v1/projects lists it. */
export interface Project {
  slug: string;
  name: string;
  goal: string | null;
  status: 'open' | 'merged' | 'closed';
  focus: { missing: Gap; within?: string; scan?: string; level?: 1 | 2 };
  creatorName: string | null;
  createdAt: string;
  total: number;
  done: number;
  keepers?: string[];
}

/** One thing to do in a project: a farbrengen, a recording to sync, a page to proofread. */
export interface ProjectItem {
  item: string;
  kind: 'event' | 'recording' | 'page';
  id: string | null;
  page?: number;
  date?: string | null;
  title?: Name;
  event?: string | null;
  level?: number;
  claimedBy?: string | null;
}

/** A file Sichos-Kodesh's archive wants and could not get from where it was. */
export interface ArchiveGap {
  collection: string;
  item_id: string;
  kind: string;
  role: string;
  url: string;
  label: string | null;
  hebrew_date: string | null;
  status: 'unresolved' | 'error';
  http_status: number | null;
  checked_at: string | null;
  entity: { id: string; path: string | null; type: string; data: Record<string, unknown> } | null;
}

/** GET /v1/mirrors. */
export interface MirrorsInfo {
  git: string[];
  keys: Array<{ alg: string; keyId: string; publicKey: string }>;
  others: Array<{ name: string; url: string }>;
  editions: Array<{
    tag: string;
    commit_seq: number;
    created_at: string;
    notes: string | null;
    dumps: { files: Array<{ name: string; bytes: number; sha256: string; url: string }>; manifest: string; sha256sums: string; signature: { alg: string; keyId: string } | null } | null;
  }>;
}

/** A name in Hebrew where it has one, else in English, else `fallback`. */
export function hebrewName(name: Name, fallback = ''): string {
  if (typeof name === 'string') return name.trim() || fallback;
  return name?.he?.trim() || name?.en?.trim() || fallback;
}

/** An item's name for a row: its title, label or name, or for an event its Hebrew date. */
export function itemName(item: { id: string; data?: Record<string, unknown> } | null | undefined, fallback = ''): string {
  if (!item) return fallback;
  const data = item.data ?? {};
  const named = hebrewName((data.title ?? data.label ?? data.name) as Name);
  if (named) return named;
  if (typeof data.date === 'string' && /^\d{4}/.test(data.date)) return describeDateKey(data.date) || data.date;
  return fallback || item.id;
}

export const count = (n: number) => n.toLocaleString('he');

/** A part of a whole, as a whole percent; a dash when there is no whole. */
export const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');

export const yearName = (year: number) => toHebrewNumeral(year);

const day = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', year: 'numeric' });
export const dayName = (iso: string | null | undefined) => (iso ? day.format(new Date(iso)) : '');

/** The Missing board counts up to 2,000 farbrengens at a time; past that it says so. */
export const MISSING_CAP = 2000;
export const capped = (n: number) => (n >= MISSING_CAP ? `${count(MISSING_CAP)}+` : count(n));

export const GAP_NAME: Record<Gap, string> = { recordings: 'הקלטות', texts: 'הנחות', sync: 'סנכרון', proofreading: 'הגהה' };

/** What a project works through, in words: "התוועדויות תשמ״ה בלי הקלטה". */
export function focusText(project: Pick<Project, 'focus'>): string {
  const within = project.focus.within ? ` ${yearName(Number(project.focus.within.slice(0, 4)))}` : '';
  if (project.focus.missing === 'proofreading') return `הגהת סריקה, ${project.focus.level === 2 ? 'הגהה שניה' : 'הגהה ראשונה'}`;
  if (project.focus.missing === 'sync') return `הקלטות${within} לסנכרון`;
  return `התוועדויות${within} ${project.focus.missing === 'recordings' ? 'בלי הקלטה' : 'בלי הנחה'}`;
}

export const STATE_NAME: Record<Project['status'], string> = { open: 'פתוח', merged: 'הושלם', closed: 'נסגר' };
