import type { CatalogEntry, PdfEdition } from '@sichos-kodesh/catalog';
import { classifyPdfEdition, isHighlightedFarbrengenHanacha } from '@sichos-kodesh/catalog';
import { MEDIA_CACHE_NAME } from './cacheName';
import { audioUrl, pdfUrl } from './download';

/** Which content types a download pass should include - the same taxonomy `SearchScreen`'s type filter already uses (audio, the highlighted hanacha edition(s), and the remaining PdfSections), not a new one invented for this feature. An empty `hanachaEditions` means "don't download the highlighted hanacha at all," not "download every edition." */
export interface DownloadContentTypes {
  audio: boolean;
  hanachaEditions: PdfEdition[];
  mugah: boolean;
  maamorim: boolean;
  hagahos: boolean;
  hosofos: boolean;
}

export interface DownloadTarget {
  url: string;
  hebrewYear: number;
  occasionId: number;
  label: string;
  kind: 'audio' | 'pdf';
}

/**
 * Every file one occasion needs fetched to satisfy `contentTypes`, as plain
 * media-proxy URLs - the same `audioUrl`/`pdfUrl` builders playback already
 * uses, so a downloaded file and a played/read one are indistinguishable to
 * the cache. A `biltiMugah` PDF that cites neither highlighted edition (a
 * genuinely different, unrelated source - see `isHighlightedFarbrengenHanacha`)
 * has no toggle of its own here and is never included - a real but rare
 * minority case not worth a settings row; it's still readable live, just
 * not pre-fetched.
 */
export function listDownloadTargets(entries: CatalogEntry[], contentTypes: DownloadContentTypes): DownloadTarget[] {
  const targets: DownloadTarget[] = [];
  for (const entry of entries) {
    if (contentTypes.audio) {
      entry.audio.forEach((chapter, index) => {
        targets.push({
          url: audioUrl(chapter.workerFilename),
          hebrewYear: entry.hebrewYear,
          occasionId: entry.occasionId,
          label: chapter.chapterName ?? `Track ${index + 1}`,
          kind: 'audio',
        });
      });
    }
    for (const pdf of entry.pdfs) {
      const included =
        pdf.section === 'biltiMugah'
          ? isHighlightedFarbrengenHanacha(pdf) && classifyPdfEdition(pdf.label).some((edition) => contentTypes.hanachaEditions.includes(edition))
          : contentTypes[pdf.section];
      if (!included) continue;
      targets.push({
        url: pdfUrl(pdf.driveFileId, pdf.resourceKey),
        hebrewYear: entry.hebrewYear,
        occasionId: entry.occasionId,
        label: pdf.label,
        kind: 'pdf',
      });
    }
  }
  return targets;
}

/**
 * Real total size of everything actually sitting in the media cache right
 * now, read directly from each cached response - not
 * `navigator.storage.estimate()`, which is *origin-wide* (so it also counts
 * the ~7MB app-shell precache having nothing to do with "downloads," always
 * inflating the number) and, worse, a real reported bug: its `usage` figure
 * lags the cache's actual contents badly enough that it can read *higher*
 * immediately after `caches.delete()` empties this exact cache, making
 * "Clear downloads" look like it did nothing even though the cache is
 * genuinely empty (confirmed directly: `cache.keys()` shows 0 entries right
 * after, while `estimate()` still reports several MB). Prefers each
 * response's own `Content-Length` header (present for every real
 * media-proxy response); falls back to materializing the blob only for the
 * rare response that lacks one, since that needs reading the actual bytes.
 */
export async function getDownloadedBytes(): Promise<number> {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const requests = await cache.keys();
  let total = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const contentLength = response.headers.get('content-length');
    total += contentLength ? Number(contentLength) : (await response.blob()).size;
  }
  return total;
}

/** Whether `target` is already fully cached - the durable, on-disk source of truth, independent of any in-memory queue state (see DownloadProvider.tsx). */
export async function isDownloaded(target: Pick<DownloadTarget, 'url'>): Promise<boolean> {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  return (await cache.match(target.url)) !== undefined;
}

/** Whether every target `contentTypes` calls for on this one occasion is already cached. `false` (not "downloaded") when there's nothing applicable to download at all, since there's nothing to show as offline-available either way. */
export async function isEntryFullyDownloaded(entry: CatalogEntry, contentTypes: DownloadContentTypes): Promise<boolean> {
  const targets = listDownloadTargets([entry], contentTypes);
  if (targets.length === 0) return false;
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const matches = await Promise.all(targets.map((target) => cache.match(target.url)));
  return matches.every((match) => match !== undefined);
}

/**
 * `true` when downloads should be skipped because the connection looks
 * metered - checked via the Network Information API's `saveData` (the user
 * has explicitly asked sites to use less data) and `type` (`'wifi'`/
 * `'ethernet'` vs. everything else). Both are Chrome/Android-only in
 * practice (`type` in particular is patchily supported even there); where
 * neither is available (notably Safari, which has none of this API),
 * there's no way to tell, so this returns `false` and the download
 * proceeds rather than silently pretending Wi-Fi-only works everywhere.
 */
function shouldSkipForMeteredConnection(): boolean {
  const connection = (navigator as { connection?: { saveData?: boolean; type?: string } }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  if (typeof connection.type === 'string') return connection.type !== 'wifi' && connection.type !== 'ethernet';
  return false;
}

export type DownloadEvent = 'downloading' | 'done' | 'error';

export interface RunDownloadOptions {
  /** How many files to fetch at once - a small, fixed pool rather than one file at a time, without opening dozens of simultaneous requests against the Worker for a whole month/year download. */
  concurrency?: number;
  wifiOnly?: boolean;
  /**
   * `progress` (0-1) accompanies a `'downloading'` event once real byte
   * counts are known - it's `undefined` on the first `'downloading'` call
   * for a target (nothing read yet) and stays `undefined` for the rest of
   * that target's download if the response has no `Content-Length` (a
   * fraction can't be computed without a known total).
   */
  onEach?: (target: DownloadTarget, event: DownloadEvent, progress?: number) => void;
  signal?: AbortSignal;
}

/**
 * Fetches one target with live byte-progress, mirroring `cache.add()`'s own
 * validation (throws on a non-ok response, same as `cache.add` does
 * internally) but reading the body through a stream reader instead of
 * awaiting it in one shot - the only way to observe progress mid-download,
 * since neither `fetch()` nor `Response` expose one otherwise. Falls back
 * to a plain, progressless read when the body can't be streamed (no
 * `Content-Length` to compute a fraction against, or a runtime without
 * `ReadableStream` body support) rather than failing the download over it.
 */
async function fetchWithProgress(url: string, onProgress: (progress: number | undefined) => void): Promise<Response> {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const total = Number(response.headers.get('content-length') ?? 0);
  if (!total || !response.body) {
    // No further progress to report - the worker loop's own initial
    // `'downloading'` event (before this function was even called) already
    // told the caller "started, fraction unknown."
    return response;
  }

  const reader = response.body.getReader();
  // BlobPart's DOM types want an ArrayBuffer-backed view specifically, not
  // the more general ArrayBufferLike a stream reader's chunks are typed
  // with (it also covers SharedArrayBuffer, which a fetch response body
  // never actually produces) - copying each chunk gives a real ArrayBuffer.
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value.slice().buffer);
    received += value.length;
    onProgress(Math.min(received / total, 1));
  }
  return new Response(new Blob(chunks), { headers: response.headers });
}

/**
 * Fetches every not-yet-cached target into the shared media cache, landing
 * in the exact bucket the service worker's own CacheFirst route already
 * reads from (see cacheName.ts) - so nothing else needs to change for a
 * downloaded file to actually get used during real playback/reading
 * afterward.
 */
export async function runDownload(targets: DownloadTarget[], options: RunDownloadOptions = {}): Promise<void> {
  const { concurrency = 3, wifiOnly = false, onEach, signal } = options;
  if (wifiOnly && shouldSkipForMeteredConnection()) return;

  const cache = await caches.open(MEDIA_CACHE_NAME);
  const pending: DownloadTarget[] = [];
  for (const target of targets) {
    if (signal?.aborted) return;
    if (await cache.match(target.url)) {
      // Already cached - nothing to fetch, but callers tallying per-occasion
      // completion (see DownloadProvider) need to hear about it the same
      // way a freshly-downloaded target is reported.
      onEach?.(target, 'done');
      continue;
    }
    pending.push(target);
  }

  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < pending.length) {
      if (signal?.aborted) return;
      const target = pending[nextIndex++]!;
      onEach?.(target, 'downloading', undefined);
      try {
        const response = await fetchWithProgress(target.url, (progress) => onEach?.(target, 'downloading', progress));
        await cache.put(target.url, response);
        onEach?.(target, 'done');
      } catch {
        onEach?.(target, 'error');
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
}
