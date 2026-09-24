import type { ResolvedJemAudio } from './db.js';
import { CcdbHttpError, resolveJemAudio } from './jemAudio.js';
import type { JemAudioRecording } from './jemAudio.js';

export interface AudioLinkRow<K> {
  key: K;
  url: string;
}

/**
 * What to do when the link's own event no longer exists in ccdb (a 404):
 * resolve another event from the same link (the parent farbrengen) and
 * keep the part of it `pick` chooses. An empty pick leaves the item
 * unresolved (`unmatched`).
 */
export interface AudioLinkFallback {
  eventIdOf: (url: string) => number | null;
  pick: (recordings: JemAudioRecording[]) => JemAudioRecording[];
}

export interface ResolveAudioLinksOptions<K> {
  rows: AudioLinkRow<K>[];
  /** The ccdb event to resolve for one ashreinu.app link, or null when the link has none. */
  eventIdOf: (url: string) => number | null;
  fallback?: AudioLinkFallback;
  replace: (key: K, recordings: ResolvedJemAudio[]) => void;
  delayMs: number;
  limit?: number;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  onProgress?: (index: number, total: number) => void;
}

export interface ResolveAudioLinksResult {
  resolved: number;
  /** Of `resolved`, how many came through the fallback. */
  resolvedByFallback: number;
  noEventId: number;
  noRecordingsFound: number;
  /** The link's event was gone and the fallback found no single part to keep. */
  unmatched: number;
  httpErrors: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flatten(recordings: JemAudioRecording[]): ResolvedJemAudio[] {
  return recordings.flatMap((r, chapterIndex) =>
    r.assets.map((a) => ({ ccdbEventId: r.eventId, chapterIndex, chapterName: r.chapterName, durationMs: r.durationMs, url: a.url, fileFormat: a.fileFormat })),
  );
}

/**
 * Resolves ashreinu.app player links to their playable JEM recordings
 * (via `resolveJemAudio`) and hands each item's flattened chapters to
 * `replace` - the loop both `bin/resolveJemAudio.ts` (farbrengens, from the
 * parent event) and `bin/resolveMaamarAudio.ts` (maamorim, from the
 * maamar's own event, falling back to the farbrengen's) run.
 */
export async function resolveAudioLinks<K>(options: ResolveAudioLinksOptions<K>): Promise<ResolveAudioLinksResult> {
  const targets = options.limit ? options.rows.slice(0, options.limit) : options.rows;
  const result: ResolveAudioLinksResult = { resolved: 0, resolvedByFallback: 0, noEventId: 0, noRecordingsFound: 0, unmatched: 0, httpErrors: 0 };
  for (let i = 0; i < targets.length; i++) {
    const { key, url } = targets[i]!;
    const eventId = options.eventIdOf(url);
    if (eventId === null) {
      result.noEventId++;
      continue;
    }
    try {
      let recordings: JemAudioRecording[];
      let viaFallback = false;
      try {
        recordings = await resolveJemAudio(eventId, options.fetchImpl);
      } catch (error) {
        const fallbackId = options.fallback?.eventIdOf(url) ?? null;
        if (!(error instanceof CcdbHttpError) || error.status !== 404 || fallbackId === null || fallbackId === eventId) throw error;
        await sleep(options.delayMs);
        recordings = options.fallback!.pick(await resolveJemAudio(fallbackId, options.fetchImpl));
        viaFallback = true;
        if (recordings.length === 0) {
          result.unmatched++;
          options.log?.(`  ${String(key)} (event ${eventId}): gone from ccdb, and event ${fallbackId} has no single part to take`);
          await sleep(options.delayMs);
          options.onProgress?.(i + 1, targets.length);
          continue;
        }
      }
      await sleep(options.delayMs);
      if (recordings.length === 0) {
        result.noRecordingsFound++;
        continue;
      }
      options.replace(key, flatten(recordings));
      result.resolved++;
      if (viaFallback) result.resolvedByFallback++;
    } catch (error) {
      result.httpErrors++;
      options.log?.(`  ${String(key)} (event ${eventId}): ${(error as Error).message}`);
      await sleep(options.delayMs);
    }
    options.onProgress?.(i + 1, targets.length);
  }
  return result;
}
