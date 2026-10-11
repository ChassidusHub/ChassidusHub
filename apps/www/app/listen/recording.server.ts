import type { ChassidusHub } from '@chassidushub/client';
import type { ApiEvent, ApiRecording } from './data.server';
import { dateLabel, withTranscripts, yearLabel } from './data.server';
import { paragraphsOf, type ApiTranscript, type Chapter } from './common';

/** The words that come with the page, at most this many characters: the rest load as the reader scrolls toward them. */
const FIRST_WORDS = 12_000;

const NIGGUN = /ניגון|ניגונים|רצית|אימתי|בבות|שיבנה|אודך|הושיעה|צמאה/;

/**
 * A recorded event's page in a few reads: the event, its recordings (one per
 * part), where the files are heard, and the first part's words.
 */
export async function recordedEvent(api: ChassidusHub, id: string) {
  const [event, { items }, transcribed] = await Promise.all([
    api.getItem({ id }) as unknown as Promise<ApiEvent & { type: string }>,
    api.listChildren({ id, field: 'event', type: 'recording', limit: 200 }) as unknown as Promise<{ items: ApiRecording[] }>,
    withTranscripts(api),
  ]);
  if (event.type !== 'event') throw new Response('not found', { status: 404 });

  // Several copies of one part (sources, qualities): the first of each.
  const seen = new Set<number>();
  const parts = items
    .filter((r) => r.data.url || r.data.file)
    .sort((a, b) => (a.data.part ?? 999) - (b.data.part ?? 999) || a.id.localeCompare(b.id))
    .filter((r) => r.data.part == null || (!seen.has(r.data.part) && !!seen.add(r.data.part)));

  const files = parts.flatMap((r) => (r.data.url || !r.data.file ? [] : [r.data.file]));
  const urls = new Map<string, string>();
  if (files.length) {
    const { items: found } = (await api.getFiles({ ids: files.join(',') })) as unknown as { items: { sha256: string; url: string | null }[] };
    for (const f of found) if (f.url) urls.set(f.sha256, f.url);
  }

  let offset = 0;
  const chapters: Chapter[] = [];
  for (const r of parts) {
    const src = r.data.url ?? (r.data.file ? urls.get(r.data.file) : undefined);
    if (!src) continue;
    const title = r.data.title?.he?.trim() || `חלק ${chapters.length + 1}`;
    const durationMs = r.data.durationMs ?? 0;
    chapters.push({ recording: r.id, title, offset, durationMs, src, niggun: NIGGUN.test(title) });
    offset += durationMs;
  }

  // The first part with words comes with the page, up to FIRST_WORDS characters.
  const first = chapters.find((c) => transcribed.recordings.has(c.recording)) ?? chapters.find((c) => !c.niggun);
  if (first) {
    const transcript = await (api.recordingTranscript({ id: first.recording }) as unknown as Promise<ApiTranscript>).catch(() => null);
    if (transcript) {
      let size = 0;
      const all = paragraphsOf(transcript);
      first.words = all.filter((p, at) => (size += p.text.length) <= FIRST_WORDS || at === 0);
      first.complete = first.words.length === all.length;
    }
  }

  const year = Number(event.data.date.slice(0, 4));
  return {
    id: event.id,
    year,
    yearName: yearLabel(year),
    date: dateLabel(event.data.date),
    title: event.data.title?.he?.trim() ?? '',
    totalMs: offset,
    chapters,
  };
}
