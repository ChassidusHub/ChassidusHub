import type { LocalName } from '@chassidushub/model';
import type { Entity } from './api.js';
import { itemPath } from './links.js';

/**
 * What the home page shows of a farbrengen (design/system, boards 29 to
 * 32): what it is about, in a few lines of its own table of contents
 * (the catalog keeps it for each one, from mafteiach.app, credited on the
 * page), and its maamar if it has one. These are the index's own words,
 * shortened, never a machine's summary. A list keeps these and drops the
 * rest, so the page carries a few hundred bytes of each.
 */

export interface FeedCard {
  id: string;
  path: string;
  title: LocalName | null;
  date: string | null;
  /** The first lines of its table of contents, each cut at its first clause. */
  topics: string[];
  /** `ד"ה ויאמר גו' מחר חודש`, when a maamar was said there. */
  maamar: string | null;
  recordings: number;
  /** Whether a recording of it has a transcript, to listen with the words. */
  transcript: boolean;
}

type Inline = { text?: string };
type Segment = { id?: string; kind?: string; text?: Inline[]; children?: Segment[] };
type Body = { versions?: Array<{ language?: string; segments?: Segment[] }> };
type Data = { title?: LocalName; date?: string; body?: Body; links?: Array<{ kind?: string; label?: LocalName }> };

const textOf = (s: Segment) => (s.text ?? []).map((x) => x.text ?? '').join('');

/** A line of the index, short enough for a card: up to its first clause, without the reference to the section (`(ס"א)`). */
export function shortTopic(line: string, max = 110): string {
  let s = line.replace(/\s*\((?:ס|סי|סע|הערה)[^)]*\)\s*$/u, '').trim();
  const cut = s.search(/ - |; |: /);
  if (cut > 24) s = s.slice(0, cut);
  s = s.replace(/[\s,;.:-]+$/u, '');
  return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/u, '')}…` : s;
}

/** The first lines of a farbrengen's table of contents, in Hebrew where it has it. */
export function topicsOf(data: Data, count = 2): string[] {
  const versions = data.body?.versions ?? [];
  const version = versions.find((v) => v.language === 'he') ?? versions[0];
  const out: string[] = [];
  const walk = (segments: Segment[] | undefined) => {
    for (const s of segments ?? []) {
      if (out.length >= count) return;
      if (s.kind === 'item') {
        const line = shortTopic(textOf(s));
        if (line) out.push(line);
      }
      walk(s.children);
    }
  };
  walk(version?.segments);
  return out;
}

/** The maamar said there, by its opening words (`ד"ה …`), when the farbrengen's links name one. */
export function maamarOf(data: Data): string | null {
  for (const l of data.links ?? []) {
    if (l.kind !== 'maamar') continue;
    const label = l.label?.he ?? '';
    const named = /ד"ה\s+[^·(]+/u.exec(label);
    if (named) return named[0].trim();
  }
  return null;
}

export function feedCard(e: Entity & { recordings?: number }, transcribed: ReadonlySet<string>): FeedCard {
  const d = e.data as Data;
  return {
    id: e.id,
    path: itemPath(e),
    title: d.title ?? null,
    date: d.date ?? null,
    topics: topicsOf(d),
    maamar: maamarOf(d),
    recordings: e.recordings ?? 0,
    transcript: transcribed.has(e.id),
  };
}
