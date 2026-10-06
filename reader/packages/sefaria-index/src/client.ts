import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SefariaIndex, SefariaTextResponse } from './types.js';
import { SEFARIA_BASE_URL, indexUrl, textUrl } from './urls.js';

export { SEFARIA_BASE_URL, indexUrl, textUrl };

/**
 * A polite Sefaria reader:
 * - one request at a time, `delayMs` apart;
 * - it names itself in the User-Agent;
 * - it retries a 429 or 5xx a few times, backing off;
 * - it keeps every answer in `cacheDir`, one file per URL.
 * So a second import reads from disk and asks Sefaria nothing, unless
 * `refresh` is set.
 */

export const DEFAULT_USER_AGENT =
  'ChassidusHubAppResearch/0.1 (+https://github.com/ChassidusHub/ChassidusHub; an offline library of Chabad texts with their licences; see repo for contact)';


export interface SefariaClientOptions {
  fetchFn?: typeof fetch;
  /** Where answers are kept. Without one, nothing is cached. */
  cacheDir?: string;
  /** The pause between two requests to Sefaria (default 500 ms). */
  delayMs?: number;
  /** The first back-off after a 429 or 5xx; it doubles each retry (default 2 s). */
  retryDelayMs?: number;
  retries?: number;
  refresh?: boolean;
  userAgent?: string;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
}

export interface SefariaClient {
  /** An index with its schema, titles filled in and content counts (`api/v2/index`). */
  index(title: string): Promise<SefariaIndex>;
  /** One version of a ref (`api/v3/texts`). A version Sefaria lacks for the ref comes back with no `versions`. */
  text(ref: string, language: 'he' | 'en', version: string): Promise<SefariaTextResponse>;
  /** Requests sent to Sefaria so far (answers read from the cache are not counted). */
  readonly requests: number;
}

export class SefariaError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}


const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function sefariaClient(options: SefariaClientOptions = {}): SefariaClient {
  const fetchFn = options.fetchFn ?? fetch;
  const delayMs = options.delayMs ?? 500;
  const retryDelayMs = options.retryDelayMs ?? 2000;
  const retries = options.retries ?? 3;
  const sleep = options.sleep ?? defaultSleep;
  const baseUrl = options.baseUrl ?? SEFARIA_BASE_URL;
  const headers = { 'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT, Accept: 'application/json' };
  let requests = 0;
  let lastRequestAt = 0;

  const cachePath = (url: string) => (options.cacheDir ? path.join(options.cacheDir, `${createHash('sha1').update(url).digest('hex')}.json`) : null);

  async function network(url: string): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
      const wait = lastRequestAt + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      requests += 1;
      let status: number | null = null;
      try {
        const response = await fetchFn(url, { headers });
        status = response.status;
        const body = await response.text();
        // Sefaria answers a bad ref with 400 and {"error": ...}: an answer, not a failure to retry.
        if (response.ok || (status === 400 && body.trimStart().startsWith('{'))) return body;
        if (status !== 429 && status < 500) throw new SefariaError(`Sefaria answered ${status} for ${url}`, status);
      } catch (error) {
        if (error instanceof SefariaError) throw error;
        if (attempt >= retries) throw new SefariaError(`Sefaria could not be reached for ${url}: ${error instanceof Error ? error.message : String(error)}`, null);
      }
      if (attempt >= retries) throw new SefariaError(`Sefaria answered ${status} for ${url}, ${retries + 1} times`, status);
      await sleep(retryDelayMs * 2 ** attempt);
    }
  }

  async function getJson<T>(url: string): Promise<T> {
    const file = cachePath(url);
    if (file && !options.refresh) {
      const cached = await readFile(file, 'utf8').catch(() => null);
      if (cached !== null) return JSON.parse(cached) as T;
    }
    const body = await network(url);
    const parsed = JSON.parse(body) as T;
    if (file) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(`${file}.partial`, body);
      await rename(`${file}.partial`, file);
    }
    return parsed;
  }

  return {
    async index(title) {
      const index = await getJson<SefariaIndex & { error?: string }>(indexUrl(title, baseUrl));
      if (index.error || !index.schema) throw new SefariaError(`Sefaria has no index "${title}": ${index.error ?? 'no schema'}`, null);
      return index;
    },
    text(ref, language, version) {
      return getJson<SefariaTextResponse>(textUrl(ref, language, version, baseUrl));
    },
    get requests() {
      return requests;
    },
  };
}
