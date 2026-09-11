import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PoliteFetcherOptions {
  /** On-disk raw-response cache so a crawl is resumable and never re-fetches the same URL twice. */
  cacheDir: string;
  /** A descriptive, identifying User-Agent - this is JEM's private backend, not a published API; always identify the crawler and its purpose. */
  userAgent: string;
  /** Delay after every network fetch (not after cache hits), default 400ms. */
  delayMs?: number;
  maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePathFor(cacheDir: string, url: string): string {
  const safe = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '_');
  return path.join(cacheDir, `${safe}.json`);
}

/** Same pattern as packages/mafteiach-index's PoliteFetcher: rate-limited, resumable, honestly identified. */
export class PoliteFetcher {
  private readonly cacheDir: string;
  private readonly userAgent: string;
  private readonly delayMs: number;
  private readonly maxRetries: number;

  constructor(options: PoliteFetcherOptions) {
    this.cacheDir = options.cacheDir;
    this.userAgent = options.userAgent;
    this.delayMs = options.delayMs ?? 400;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async fetchJson<T>(url: string): Promise<T> {
    const cachePath = cachePathFor(this.cacheDir, url);
    const cached = await readFile(cachePath, 'utf8').catch(() => null);
    if (cached !== null) return JSON.parse(cached) as T;

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
        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
