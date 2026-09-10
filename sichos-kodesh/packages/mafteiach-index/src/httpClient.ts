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
}
