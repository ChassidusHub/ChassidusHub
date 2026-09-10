import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PoliteFetcherOptions {
  /** On-disk raw-response cache so a crawl is resumable and re-parsing never re-fetches. */
  cacheDir: string;
  /** A descriptive, identifying User-Agent — this is a small community site, not a CDN; always identify the crawler and its purpose. */
  userAgent: string;
  /** Delay after every network fetch (not after cache hits), default 750ms. */
  delayMs?: number;
  maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePathFor(cacheDir: string, url: string): string {
  const safe = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '_');
  return path.join(cacheDir, `${safe}.txt`);
}

/** Separate namespace from `fetchText`'s plain-text cache, since this one needs to store the ETag alongside the body. */
function revalidationCachePathFor(cacheDir: string, url: string): string {
  const safe = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '_');
  return path.join(cacheDir, 'etag', `${safe}.json`);
}

interface RevalidationCacheEntry {
  etag: string | null;
  body: string;
}

export interface RevalidationResult {
  body: string;
  etag: string | null;
  /** false only when a 304 confirmed the cached body is still current; true for a first fetch or a genuine change. */
  changed: boolean;
}

/**
 * A rate-limited, caching HTTP client. Every unique URL is fetched at most
 * once ever (across process runs) — repeated crawls, retries after a crash,
 * and re-parsing after a parser bugfix all replay from disk instead of
 * hitting mafteiach.app again.
 */
export class PoliteFetcher {
  private readonly cacheDir: string;
  private readonly userAgent: string;
  private readonly delayMs: number;
  private readonly maxRetries: number;

  constructor(options: PoliteFetcherOptions) {
    this.cacheDir = options.cacheDir;
    this.userAgent = options.userAgent;
    this.delayMs = options.delayMs ?? 750;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async fetchText(url: string): Promise<string> {
    const cachePath = cachePathFor(this.cacheDir, url);
    const cached = await readFile(cachePath, 'utf8').catch(() => null);
    if (cached !== null) return cached;

    await mkdir(this.cacheDir, { recursive: true });
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.delayMs * 2 ** attempt);
      try {
        const response = await fetch(url, { headers: { 'User-Agent': this.userAgent } });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        const text = await response.text();
        await writeFile(cachePath, text, 'utf8');
        await sleep(this.delayMs);
        return text;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Like `fetchText`, but for incremental sync: sends `If-None-Match` when
   * a prior ETag is cached, so an unchanged page costs mafteiach.app a
   * cheap 304 (a real request still counts against politeness/rate limits
   * — this doesn't skip the delay — but it's a small response instead of
   * the full body, and it's how the sync tells "unchanged" from "new/edited"
   * instead of just guessing from a TTL).
   */
  async fetchWithRevalidation(url: string): Promise<RevalidationResult> {
    const cachePath = revalidationCachePathFor(this.cacheDir, url);
    const cachedRaw = await readFile(cachePath, 'utf8').catch(() => null);
    const cached: RevalidationCacheEntry | null = cachedRaw ? JSON.parse(cachedRaw) : null;

    await mkdir(path.dirname(cachePath), { recursive: true });
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.delayMs * 2 ** attempt);
      try {
        const headers: Record<string, string> = { 'User-Agent': this.userAgent };
        if (cached?.etag) headers['If-None-Match'] = cached.etag;

        const response = await fetch(url, { headers });
        await sleep(this.delayMs);

        if (response.status === 304 && cached) {
          return { body: cached.body, etag: cached.etag, changed: false };
        }
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

        const body = await response.text();
        const etag = response.headers.get('etag');
        await writeFile(cachePath, JSON.stringify({ etag, body } satisfies RevalidationCacheEntry), 'utf8');
        return { body, etag, changed: true };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
