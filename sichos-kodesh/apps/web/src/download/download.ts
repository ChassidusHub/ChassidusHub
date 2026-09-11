import { MEDIA_PROXY_BASE_URL } from '../config';

export interface DownloadProgress {
  received: number;
  total: number;
}

/**
 * Fetches a URL once, reporting progress as it streams in. The service
 * worker's registered runtime-caching route (see vite.config.ts) is what
 * actually makes this available offline afterward - this function's job
 * is just to trigger that fetch (so it's cached) and give the UI a real
 * progress bar while it happens, not to manage caching itself.
 */
async function fetchWithProgress(url: string, onProgress?: (p: DownloadProgress) => void): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  if (!onProgress || !response.body) return response;

  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress({ received, total });
  }

  return new Response(new Blob(chunks as BlobPart[]), { headers: response.headers, status: response.status });
}

/** Downloads (and, via the service worker, caches for offline use) one occasion's audio through /jem-audio/:filename. */
export function downloadAudio(workerFilename: string, onProgress?: (p: DownloadProgress) => void): Promise<Response> {
  return fetchWithProgress(`${MEDIA_PROXY_BASE_URL}/jem-audio/${workerFilename}`, onProgress);
}

/** Downloads (and caches) one PDF through /drive/:fileId. */
export function downloadPdf(driveFileId: string, onProgress?: (p: DownloadProgress) => void): Promise<Response> {
  const filename = `${driveFileId}.pdf`;
  return fetchWithProgress(`${MEDIA_PROXY_BASE_URL}/drive/${driveFileId}?filename=${encodeURIComponent(filename)}`, onProgress);
}

/** The playable/openable URL for an already-downloaded (or not-yet-downloaded - the browser fetches on demand either way) audio file. */
export function audioUrl(workerFilename: string): string {
  return `${MEDIA_PROXY_BASE_URL}/jem-audio/${workerFilename}`;
}

/** The openable URL for a PDF - opened in a new tab via the browser's native PDF viewer. */
export function pdfUrl(driveFileId: string): string {
  const filename = `${driveFileId}.pdf`;
  return `${MEDIA_PROXY_BASE_URL}/drive/${driveFileId}?filename=${encodeURIComponent(filename)}`;
}
