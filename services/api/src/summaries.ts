import { transcribedRecordings, type Catalog, type TranscribedRecording } from '@chassidushub/core';

/**
 * Answers too costly to work out while someone waits, worked out by the
 * scheduled run instead and kept in the public bucket (r2.ts), so a page
 * never waits on them. GET /v1/transcripts counts every paragraph of every
 * transcript and whether each is timed word by word: tens of seconds once
 * the database has it cold (issue #87, the home page waiting 35 seconds
 * after a quiet spell). Kept here, it is at most SUMMARY_MAX_AGE_MS behind
 * the catalog, plus a run.
 */

/** How many recordings the kept list holds: the most any request may ask for. */
export const TRANSCRIPTS_KEPT = 1000;
/** How old a kept list may get before the scheduled run makes it again. */
export const SUMMARY_MAX_AGE_MS = 15 * 60_000;

export interface TranscriptsSummary {
  /** When it was made (ISO). */
  at: string;
  recordings: TranscribedRecording[];
}

/** Where the kept list is (R2 on Workers). */
export interface SummaryStore {
  read(): Promise<TranscriptsSummary | null>;
  write(summary: TranscriptsSummary): Promise<void>;
}

/** The recordings a request asks for: from the kept list when there is one, else worked out now (local work, a first deploy). */
export async function transcriptsFor(catalog: Catalog, store: SummaryStore | undefined, limit: number | undefined): Promise<TranscribedRecording[]> {
  const n = Math.min(Math.max(limit ?? 50, 1), TRANSCRIPTS_KEPT);
  const kept = await store?.read().catch(() => null);
  return kept ? kept.recordings.slice(0, n) : transcribedRecordings(catalog, { limit: n });
}

/** Makes the kept list again when it is missing or older than SUMMARY_MAX_AGE_MS; whether it did. */
export async function refreshTranscripts(catalog: Catalog, store: SummaryStore, now: Date): Promise<boolean> {
  const kept = await store.read().catch(() => null);
  if (kept && now.getTime() - Date.parse(kept.at) < SUMMARY_MAX_AGE_MS) return false;
  const recordings = await transcribedRecordings(catalog, { limit: TRANSCRIPTS_KEPT });
  await store.write({ at: now.toISOString(), recordings });
  return true;
}
