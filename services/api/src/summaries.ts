import { machineToCheck, mafteach, transcribedRecordings, type Catalog, type MachineToCheck, type MafteachKept, type TranscribedRecording } from '@chassidushub/core';

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

/**
 * Other answers kept by name in the same bucket (r2.ts): the list of what
 * the machines wrote that nobody checked (GET /v1/machine/to-check) and the
 * built subject index (GET /v1/mafteach). Each took longer than a request
 * may run on a cold database, so /help and /mafteach waited 30 s and then
 * failed (issue #104).
 */
export interface Kept {
  get<T>(name: string): Promise<T | null>;
  put(name: string, value: unknown): Promise<void>;
}

/** How many of each list the kept to-check holds: the most any request may ask for. */
export const TO_CHECK_KEPT = 200;

interface KeptToCheck {
  at: string;
  lists: MachineToCheck;
}

/** What the machines wrote that nobody checked: from the kept lists, cut to the limit, else worked out now. */
export async function toCheckFor(catalog: Catalog, kept: Kept | undefined, limit: number): Promise<MachineToCheck> {
  const got = await kept?.get<KeptToCheck>('to-check').catch(() => null);
  if (!got) return machineToCheck(catalog, { limit });
  const { transcripts, scans, texts, totals } = got.lists;
  return { transcripts: transcripts.slice(0, limit), scans: scans.slice(0, limit), texts: texts.slice(0, limit), totals };
}

/** Makes the kept to-check lists again when missing or older than SUMMARY_MAX_AGE_MS; whether it did. */
export async function refreshToCheck(catalog: Catalog, kept: Kept, now: Date): Promise<boolean> {
  const got = await kept.get<KeptToCheck>('to-check').catch(() => null);
  if (got && now.getTime() - Date.parse(got.at) < SUMMARY_MAX_AGE_MS) return false;
  await kept.put('to-check', { at: now.toISOString(), lists: await machineToCheck(catalog, { limit: TO_CHECK_KEPT }) } satisfies KeptToCheck);
  return true;
}

/** A subject index kept built in the bucket, by its index and sefer. */
export function keptMafteach(kept: Kept): MafteachKept {
  return {
    get: (at) => kept.get(`mafteach-${at}`),
    put: (at, value) => kept.put(`mafteach-${at}`, value),
  };
}

/** The subject indexes the site shows (/mafteach), built again by the scheduled run whenever one of their pages changed. */
export const KEPT_INDEXES = [{ index: '/likkutei-sichos-mafteach-inyanim', sefer: '/likkutei-sichos' }];

/** Builds each kept index again when its pages changed since it was kept; how many it built. */
export async function refreshMafteach(catalog: Catalog, kept: Kept): Promise<number> {
  let built = 0;
  for (const { index, sefer } of KEPT_INDEXES) {
    const [indexAt, seferAt] = await Promise.all([catalog.resolvePath(index), catalog.resolvePath(sefer)]);
    if (!indexAt) continue;
    let did = false;
    await mafteach(catalog, indexAt.id, { seferId: seferAt?.id ?? null, kept: keptMafteach(kept), limit: 1, onBuild: () => void (did = true) });
    if (did) built++;
  }
  return built;
}
