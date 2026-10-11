/*
 * What listening's screens share in the browser and on the server: the shapes
 * of their data, where a reader stopped, the ways in, and the path bar's levels.
 */
import type { MenuItem, PathLevel } from '../ui';

/** One event in a list of recordings: its date, a line about it, and its page. */
export interface EventRow {
  id: string;
  to: string;
  title: string;
  sub: string;
}

/**
 * Where a reader stopped, kept in a cookie so the server can draw Home's
 * "continue" tiles in the first paint, with nothing moving after it.
 * `ch_listen` is written while a recording plays; `ch_read` by the reader.
 */
export interface Stopped {
  to: string;
  title: string;
  sub?: string;
  /** For a recording: which one, and where in it (ms), and how long it is. */
  recording?: string;
  at?: number;
  durationMs?: number;
}

/** The API, read from the browser for words that load after the page. */
export const API = 'https://api.chassidushub.org';

export const LISTEN_COOKIE = 'ch_listen';
export const READ_COOKIE = 'ch_read';

/** A cookie's value read from a request's Cookie header, as the shape above; null when missing or broken. */
export function readStopped(cookies: string | null, name: string): Stopped | null {
  const raw = cookies
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Stopped;
    return typeof value.to === 'string' && value.to.startsWith('/') && typeof value.title === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function writeStopped(name: string, value: Stopped) {
  document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; path=/; max-age=31536000; samesite=lax`;
}

/** 1:02:03, or 4:05 under an hour. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** The recording page, opened at the part and the second where the reader stopped (?r=rh-…&t=seconds). */
export function resumeLink(stopped: Stopped): string {
  if (!stopped.recording) return stopped.to;
  return `${stopped.to}?r=${encodeURIComponent(stopped.recording)}&t=${Math.floor((stopped.at ?? 0) / 1000)}`;
}

/** A paragraph of words, and where in its part it is heard (ms). */
export interface Paragraph {
  id: string;
  text: string;
  start: number | null;
  machine: boolean;
}

/** A part of the event on its page: its name, where it starts in the whole, its sound, and its words when they came with the page. */
export interface Chapter {
  recording: string;
  title: string;
  /** Where it starts, counted from the start of the event. */
  offset: number;
  durationMs: number;
  src: string;
  /** No words: a niggun. Else the words come with the page (`words`) or are fetched when it nears the screen. */
  niggun: boolean;
  words?: Paragraph[];
  /** Whether `words` are all of them, or only the first that came with the page. */
  complete?: boolean;
}

export interface ApiTranscript {
  paragraphs: { id: string; content: string; startMs?: number | null; checked?: boolean }[];
}

/** The words of a transcript as the page shows them: only text, where it is heard, and whether a person checked it. */
export function paragraphsOf(transcript: ApiTranscript): Paragraph[] {
  return transcript.paragraphs.map((p) => ({ id: p.id, text: p.content, start: p.startMs ?? null, machine: !p.checked }));
}

/* ---------- the ways in ---------- */

/** The years the Rebbe's recordings are from, first to last. */
export const YEARS = Array.from({ length: 5752 - 5710 + 1 }, (_, at) => 5710 + at);

/** The days people look for, in the order of the year: listening's "events" (מאורעות). */
export const DAYS: { day: string; label: string }[] = [
  { day: '01-23', label: 'שמחת תורה' },
  { day: '03-19', label: 'י״ט כסלו' },
  { day: '04-24', label: 'כ״ד טבת' },
  { day: '05-10', label: 'יו״ד שבט' },
  { day: '06-14', label: 'פורים' },
  { day: '07-11', label: 'י״א ניסן' },
  { day: '09-06', label: 'שבועות' },
  { day: '10-12', label: 'י״ב תמוז' },
  { day: '11-20', label: 'כ׳ מנחם אב' },
];

/* ---------- the path bar ---------- */


/** The path bar's first level on every listening page: listening, with the library as the other place. */
export const listening: PathLevel = {
  key: 'place',
  label: 'שמיעה',
  icon: 'listen',
  title: 'מקום',
  items: [
    { key: 'library', label: 'ספרייה', to: '/library' },
    { key: 'listen', label: 'שמיעה', to: '/listen', current: true },
  ],
};

/** A year's level: every year, as the loader names them (the Hebrew numerals are worked out on the server). */
export function yearLevel(years: { year: number; label: string }[], current: number): PathLevel {
  const label = years.find((y) => y.year === current)?.label ?? String(current);
  return {
    key: 'year',
    label,
    title: 'שנים',
    items: years.map((y) => ({ key: String(y.year), label: y.label, also: String(y.year), to: `/listen/${y.year}`, current: y.year === current })),
  };
}

/** An event's level: the other events of its year with recordings, fetched when the level is opened. */
export function eventLevel(year: number, yearName: string, event: { id: string; label: string }): PathLevel {
  return {
    key: 'event',
    label: event.label,
    title: yearName,
    items: async () => {
      const response = await fetch(`/listen/${year}/menu`);
      const items = (await response.json()) as MenuItem[];
      return items.map((item) => ({ ...item, current: item.key === event.id }));
    },
  };
}
