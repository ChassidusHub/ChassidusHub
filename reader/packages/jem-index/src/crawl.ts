import type { DatabaseSync } from 'node:sqlite';
import { CcdbClient } from './ccdbClient.js';
import { flattenEventTree } from './flatten.js';
import { replaceAudioRecordings, upsertEvent } from './db.js';
import { PoliteFetcher } from './httpClient.js';
import type { JemAudioRecordingRow } from './types.js';

export interface CrawlProgress {
  index: number;
  total: number;
  year: number;
  eventId: number;
}

export interface CrawlOptions {
  db: DatabaseSync;
  cacheDir: string;
  userAgent: string;
  delayMs?: number;
  /** Restrict the crawl to specific Hebrew years instead of every year `years?has=audio` reports - for pilots/tests. */
  years?: number[];
  onProgress?: (progress: CrawlProgress) => void;
}

export interface CrawlSummary {
  years: number;
  topLevelEvents: number;
  totalNodes: number;
  inserted: number;
  updated: number;
  unchanged: number;
  recordings: number;
}

/**
 * Crawls JEM's entire ccdb catalog of years/events with audio: one request
 * for the year list, one `events?year=Y` listing per year, then one
 * `event/{id}` tree fetch per top-level event (each tree fetch already
 * returns every descendant node in one response - see ccdbClient.ts).
 * Every node from every tree is upserted, and each node's audio
 * recordings are fully replaced on every run (not just appended), so a
 * re-crawl correctly reflects recordings JEM has since added or removed
 * from a given event. Safe to interrupt and re-run: the fetcher's
 * on-disk cache means a re-run does no network I/O for anything already
 * fetched, and `upsertEvent`'s content-hash check means unchanged nodes
 * only bump crawl bookkeeping, not `last_changed_at`.
 */
export async function crawlAll(options: CrawlOptions): Promise<CrawlSummary> {
  const fetcher = new PoliteFetcher({ cacheDir: options.cacheDir, userAgent: options.userAgent, delayMs: options.delayMs });
  const client = new CcdbClient(fetcher);

  const years = options.years ?? (await client.getYearsWithAudio());

  const topLevelEntries: { id: number; year: number }[] = [];
  for (const year of years) {
    const events = await client.getEventsForYear(year);
    for (const event of events) topLevelEntries.push({ id: event.id, year });
  }

  const seenIds = new Set<number>();
  const uniqueEntries = topLevelEntries.filter((entry) => {
    if (seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    return true;
  });

  const now = new Date().toISOString();
  const summary: CrawlSummary = {
    years: years.length,
    topLevelEvents: uniqueEntries.length,
    totalNodes: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    recordings: 0,
  };

  for (let i = 0; i < uniqueEntries.length; i++) {
    const entry = uniqueEntries[i]!;
    const tree = await client.getEventTree(entry.id);
    const { nodes, recordings } = flattenEventTree(tree);

    const recordingsByEventId = new Map<number, JemAudioRecordingRow[]>();
    for (const recording of recordings) {
      const list = recordingsByEventId.get(recording.eventId) ?? [];
      list.push(recording);
      recordingsByEventId.set(recording.eventId, list);
    }

    for (const node of nodes) {
      const { status } = upsertEvent(options.db, node, now);
      summary.totalNodes++;
      summary[status]++;
      replaceAudioRecordings(options.db, node.id, recordingsByEventId.get(node.id) ?? []);
    }
    summary.recordings += recordings.length;

    options.onProgress?.({ index: i + 1, total: uniqueEntries.length, year: entry.year, eventId: entry.id });
  }

  return summary;
}
