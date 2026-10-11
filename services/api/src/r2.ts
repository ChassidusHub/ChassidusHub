import type { FileStore } from './app.js';
import { STATUS_KEY, type StatusReport, type StatusStore } from './status.js';
import type { Kept, SummaryStore, TranscriptsSummary } from './summaries.js';

/**
 * The little of an R2 bucket the API uses (declared here rather than
 * taking all of @cloudflare/workers-types, whose globals would clash
 * with the site's DOM types), and the stores the app reads through it:
 * files that may be served, the texts of seforim, and the status checks'
 * last report. Both Workers use these: the API's own (worker.ts) and the
 * site's, which answers its own reads (reads.ts).
 */
export interface R2Bucket {
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<({ body: ReadableStream; size: number } & { text(): Promise<string> }) | null>;
  put(key: string, value: ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
}

export function r2Writer(bucket: R2Bucket): { put(key: string, bytes: ArrayBuffer, mime: string): Promise<void> } {
  return { put: async (key: string, bytes: ArrayBuffer, mime: string) => void (await bucket.put(key, bytes, { httpMetadata: { contentType: mime } })) };
}

export function r2Store(bucket: R2Bucket): FileStore {
  return {
    async get(key, range) {
      const object = await bucket.get(key, range ? { range } : undefined);
      return object ? { body: object.body, size: object.size } : null;
    },
  };
}

/** The report kept in the public bucket, for GET /v1/status. */
export function statusStore(bucket: R2Bucket): StatusStore {
  return {
    async read() {
      const object = await bucket.get(STATUS_KEY);
      return object ? (JSON.parse(await object.text()) as StatusReport) : null;
    },
  };
}

/** Where the scheduled run keeps the transcripts summary (summaries.ts). */
export const TRANSCRIPTS_SUMMARY_KEY = 'summaries/transcripts.json';

/** The transcripts summary kept in the public bucket, for GET /v1/transcripts. */
export function transcriptsStore(bucket: R2Bucket): SummaryStore {
  return {
    async read() {
      const object = await bucket.get(TRANSCRIPTS_SUMMARY_KEY);
      return object ? (JSON.parse(await object.text()) as TranscriptsSummary) : null;
    },
    async write(summary) {
      await bucket.put(TRANSCRIPTS_SUMMARY_KEY, JSON.stringify(summary), { httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' } });
    },
  };
}

/** Answers the scheduled run keeps by name (summaries.ts), each as summaries/<name>.json in the public bucket. */
export function keptStore(bucket: R2Bucket): Kept {
  const key = (name: string) => `summaries/${name.replace(/[^\w.-]+/g, '_')}.json`;
  return {
    async get<T>(name: string) {
      const object = await bucket.get(key(name));
      return object ? (JSON.parse(await object.text()) as T) : null;
    },
    async put(name, value) {
      await bucket.put(key(name), JSON.stringify(value), { httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' } });
    },
  };
}
