import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// Vite's `?url` import gives the worker script a real, fetchable URL in the
// built bundle - pdf.js needs its own worker thread even when we only ever
// call it from one place, it isn't optional.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// pdfjs-dist must stay >=6.2.108: versions >=5.6.83 and <6.2.108 have a
// real high-severity advisory ("Arbitrary JavaScript execution upon
// opening a malicious PDF", GHSA-hq66-cqwq-w95j) - relevant here since
// this app renders whatever PDF a Drive link points to. Every current
// version of pdfjs-dist (patched or not - checked 6.0.227 through 6.3.289,
// all of them) calls `Map.prototype.getOrInsertComputed` internally with
// no fallback - a real gap on plenty of browsers actually in use today
// (not just old ones), so downgrading within the patched range doesn't
// avoid it. `../polyfills.ts` (imported once, in main.tsx, before
// anything touches pdf.js) supplies it when missing - confirmed by
// reproducing the exact failure (page.render() throwing mid-render,
// leaving a blank canvas in place of the page) against a real PDF with
// the polyfill removed, then confirming it renders correctly with the
// polyfill in place.

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Served from public/pdf-wasm, public/pdf-cmaps, public/pdf-standard-fonts -
// copied there from node_modules/pdfjs-dist at dev/build time by
// vite.config.ts's copyPdfAssets, since pdf.js fetches each of these by a
// hardcoded filename appended to the base URL, not via a normal JS import.
const BASE_URL = import.meta.env.BASE_URL;

export function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({
    data,
    wasmUrl: `${BASE_URL}pdf-wasm/`,
    cMapUrl: `${BASE_URL}pdf-cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE_URL}pdf-standard-fonts/`,
  }).promise;
}

/**
 * Renders every page of an already-loaded PDF into freshly-created
 * `<canvas>` elements appended to `container`, one page at a time (so the
 * first page appears as soon as it's ready rather than only once the
 * whole document is rendered) - scaled to the container's width so pages
 * read naturally when scrolled through on a phone-width screen.
 *
 * Rendered at `devicePixelRatio` (canvas backing-store resolution) but
 * *displayed* at the CSS/layout size via `canvas.style.width/height` -
 * without this a canvas sized for CSS pixels reads visibly blurry on any
 * high-DPI (e.g. Retina) screen, which is real, reported behavior
 * ("sometimes it does load but in low quality"), not a hypothetical.
 */
export async function renderPdfPages(
  doc: PDFDocumentProxy,
  container: HTMLElement,
  isCancelled: () => boolean,
): Promise<void> {
  const dpr = window.devicePixelRatio || 1;
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    if (isCancelled()) return;
    const page = await doc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const containerWidth = container.clientWidth || 400;
    const cssScale = containerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: cssScale * dpr });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${viewport.height / dpr}px`;
    canvas.className = 'pdf-page';
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    if (isCancelled()) return;
    container.appendChild(canvas);
    await page.render({ canvas, viewport }).promise;
  }
}
