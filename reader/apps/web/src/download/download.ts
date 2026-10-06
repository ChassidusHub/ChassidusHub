import { MEDIA_PROXY_BASE_URL } from '../config';

/** The playable URL for an audio file - the browser streams it directly via `<audio src>`; the service worker's runtime-caching route (see vite.config.ts) makes it available offline afterward without this app managing caching itself. */
export function audioUrl(workerFilename: string): string {
  return `${MEDIA_PROXY_BASE_URL}/jem-audio/${workerFilename}`;
}

/** The openable URL for a PDF - passed to pdf.js's `getDocument({ url })`, which does its own streaming fetch (see pdf/renderPdf.ts). `resourceKey` is required for links shared before Google's 2021 resource-key change (see CatalogPdf.resourceKey) - omitted, the file 404s/redirects to a Google sign-in page even though it's genuinely public. */
export function pdfUrl(driveFileId: string, resourceKey?: string): string {
  const filename = `${driveFileId}.pdf`;
  const params = new URLSearchParams({ filename });
  if (resourceKey) params.set('resourcekey', resourceKey);
  return `${MEDIA_PROXY_BASE_URL}/drive/${driveFileId}?${params.toString()}`;
}
