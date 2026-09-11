import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// Vite's `?url` import gives the worker script a real, fetchable URL in the
// built bundle - pdf.js needs its own worker thread even when we only ever
// call it from one place, it isn't optional.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// pdfjs-dist must stay >=6.2.108: versions >=5.6.83 and <6.2.108 have a
// real high-severity advisory ("Arbitrary JavaScript execution upon
// opening a malicious PDF", GHSA-hq66-cqwq-w95j) - relevant here since
// this app renders whatever PDF a Drive link points to. Every version
// from ~5.5 onward (including this one) also calls the very recently
// standardized `Map.prototype.getOrInsertComputed` internally with no
// fallback - real current browsers already have it, but Playwright's own
// bundled test Chromium in this dev sandbox is older and doesn't, so it
// throws there specifically. That's a sandbox/test-tooling gap, not a
// reason to downgrade into the vulnerable range.

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({ data }).promise;
}

/**
 * Renders every page of an already-loaded PDF into freshly-created
 * `<canvas>` elements appended to `container`, one page at a time (so the
 * first page appears as soon as it's ready rather than only once the
 * whole document is rendered) - scaled to the container's width so pages
 * read naturally when scrolled through on a phone-width screen.
 */
export async function renderPdfPages(
  doc: PDFDocumentProxy,
  container: HTMLElement,
  isCancelled: () => boolean,
): Promise<void> {
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    if (isCancelled()) return;
    const page = await doc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const containerWidth = container.clientWidth || 400;
    const viewport = page.getViewport({ scale: containerWidth / unscaledViewport.width });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.className = 'pdf-page';
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    if (isCancelled()) return;
    container.appendChild(canvas);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  }
}
