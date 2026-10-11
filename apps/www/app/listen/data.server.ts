import { dateKeyFromGregorian, describeDateKey, monthByToken, parseDateKey, toHebrewNumeral } from '@chassidushub/hebrew';
import type { ChassidusHub } from '@chassidushub/client';
import type { EventRow } from './common';
export { DAYS, YEARS } from './common';

/** What the API says about an event (GET /v1/events, brief). */
export interface ApiEvent {
  id: string;
  data: { date: string; kind?: string; title?: { he?: string; en?: string }; order?: number };
  recordings?: number;
}

/** What the API says about one recording of an event. */
export interface ApiRecording {
  id: string;
  data: { title?: { he?: string; en?: string }; url?: string; file?: string; durationMs?: number; part?: number; event?: string };
}

const kinds: Record<string, string> = {
  farbrengen: 'התוועדות',
  sicha: 'שיחה',
  maamar: 'מאמר',
  yechidus: 'יחידות',
  kinus: 'כינוס',
};

/** The Hebrew date of a day people live in now (the civil day; a farbrengen's evening belongs to it too). */
export function today(now = new Date()): string {
  return dateKeyFromGregorian(now.toISOString().slice(0, 10)) ?? '';
}

/** The days from `from` on, as the API's `day=` takes them (MM-DD), for `count` days. */
export function nextDays(count: number, now = new Date()): string[] {
  const days: string[] = [];
  for (let at = 0; at < count; at++) {
    const key = today(new Date(now.getTime() + at * 86_400_000));
    const parts = parseDateKey(key);
    if (parts?.month && parts.day) days.push(`${parts.month}-${String(parts.day).padStart(2, '0')}`);
  }
  return days;
}

export const yearLabel = (year: number) => toHebrewNumeral(year);
export const dateLabel = (key: string) => describeDateKey(key);
export const monthLabel = (key: string) => {
  const month = parseDateKey(key)?.month;
  return month ? (monthByToken(month)?.he ?? '') : '';
};

/** Recording pages live under their year: /listen/5747/rh-…. */
export const eventPath = (event: ApiEvent) => `/listen/${event.data.date.slice(0, 4)}/${event.id}`;

/**
 * One event as a row in a list: its date as the title, and under it what it
 * was, how many parts, and whether its words are there to follow.
 */
export function eventRow(event: ApiEvent, withWords: Set<string>, { dateFirst = true } = {}): EventRow {
  const parts = event.recordings ?? 0;
  const title = event.data.title?.he?.trim();
  const sub = [
    dateFirst ? title : dateLabel(event.data.date),
    !title && event.data.kind ? kinds[event.data.kind] : undefined,
    parts > 1 ? `${parts} חלקים` : undefined,
    withWords.has(event.id) ? 'עם המילים' : undefined,
  ].filter(Boolean);
  return {
    id: event.id,
    to: eventPath(event),
    title: dateFirst ? dateLabel(event.data.date) : title || dateLabel(event.data.date),
    sub: sub.join(' · '),
  };
}

/** Every recording with a transcript to follow along with, and their events (the API keeps this list ready; one cached read). */
export async function withTranscripts(api: ChassidusHub): Promise<{ events: Set<string>; recordings: Set<string> }> {
  try {
    const recordings = (await api.transcribedRecordings({ limit: 1000 })).recordings as { recording: string; event?: string }[];
    return { events: new Set(recordings.flatMap((r) => (r.event ? [r.event] : []))), recordings: new Set(recordings.map((r) => r.recording)) };
  } catch {
    return { events: new Set(), recordings: new Set() };
  }
}

/** The events whose words can be followed. */
export const eventsWithWords = async (api: ChassidusHub) => (await withTranscripts(api)).events;

/** Events with recordings on these days of the year (MM-DD), in any year. */
export async function eventsOn(api: ChassidusHub, days: string[]): Promise<ApiEvent[]> {
  const items = (await api.listEvents({ day: days.join(','), brief: '1', limit: 500 })).items as unknown as ApiEvent[];
  return items.filter((e) => (e.recordings ?? 0) > 0);
}

/** Events with recordings in one year, in the order of the year. */
export async function eventsIn(api: ChassidusHub, year: number): Promise<ApiEvent[]> {
  const items = (await api.listEvents({ within: String(year), brief: '1', limit: 1000 })).items as unknown as ApiEvent[];
  return items.filter((e) => (e.recordings ?? 0) > 0);
}

/**
 * Something fitting to play now: the farbrengens of the coming days in earlier
 * years, the ones whose words can be followed first, then the fuller ones.
 */
export function fitting(events: ApiEvent[], withWords: Set<string>, count: number): ApiEvent[] {
  return [...events]
    .sort((a, b) => Number(withWords.has(b.id)) - Number(withWords.has(a.id)) || (b.recordings ?? 0) - (a.recordings ?? 0) || b.data.date.localeCompare(a.data.date))
    .slice(0, count);
}

/** The Rebbeim, in order: the top shelves of the library (the Library thread keeps the same list). */
const REBBEIM = ['baal-shem-tov', 'maggid', 'alter-rebbe', 'mitteler-rebbe', 'tzemach-tzedek', 'rebbe-maharash', 'rebbe-rashab', 'frierdiker-rebbe', 'the-rebbe'];

/** The Rebbeim with the first of their sefarim under each name: one cached read of the library's shelves. */
export async function rebbeim(api: ChassidusHub): Promise<{ to: string; name: string; sefarim: string }[]> {
  type Shelf = { id: string; path?: string | null; data: { slug?: string; name?: { he?: string }; parent?: string; order?: string } };
  const items = (await api.listItems({ type: 'set', shelf: true, limit: 200 })).items as unknown as Shelf[];
  const order = (x: { data: { order?: string } }) => x.data.order ?? '~';
  return REBBEIM.flatMap((slug) => {
    const set = items.find((s) => s.data.slug === slug && !s.data.parent);
    if (!set) return [];
    const sefarim = items
      .filter((s) => s.data.parent === set.id)
      .sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0))
      .slice(0, 3)
      .map((s) => s.data.name?.he)
      .filter(Boolean);
    return [{ to: set.path ?? `/sets/${slug}`, name: set.data.name?.he ?? slug, sefarim: sefarim.join(' · ') }];
  });
}
