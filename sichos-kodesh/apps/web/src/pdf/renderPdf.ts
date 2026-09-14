import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
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

// Real device pixel ratios run past 3 on plenty of Android phones. Each
// canvas's backing-store memory scales with the *square* of this factor
// (width x height x 4 bytes/pixel), so left uncapped, a multi-page
// document's canvases can add up to hundreds of MB to a mobile browser
// tab - a real, reproduced cause of the tab crashing outright ("Aw,
// Snap!"), not just a slowdown. 2x already reads sharp; capping here is
// the same tradeoff every native app makes rather than rendering at full
// panel resolution for offscreen content.
const MAX_DPR = 2;

/**
 * Renders a PDF's pages lazily, one canvas per page, as they scroll near
 * the viewport - not all of them upfront. A page far off-screen has its
 * canvas released back to a same-sized placeholder (freeing its backing
 * -store memory) rather than staying resident forever; scrolling back to
 * it re-renders on demand. This, together with the `MAX_DPR` cap above,
 * is what actually keeps a real multi-page document from crashing a
 * mobile tab - rendering every page unconditionally (even before this
 * had capped DPR) kept every canvas alive for the life of the screen.
 *
 * Resolves once the first page has rendered (so the screen has real
 * content to show), not once every page has - the rest render as the
 * user scrolls. `isCancelled` doubles as the teardown signal: once it
 * returns true the IntersectionObserver disconnects itself on its next
 * callback, so callers don't need to hold a separate handle to it.
 */
export async function renderPdfPages(
  doc: PDFDocumentProxy,
  container: HTMLElement,
  isCancelled: () => boolean,
): Promise<void> {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const containerWidth = container.clientWidth || 400;

  const wrappers: HTMLDivElement[] = [];
  const viewports: PageViewport[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    if (isCancelled()) return;
    const page = await doc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const cssScale = containerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: cssScale * dpr });
    viewports.push(viewport);

    // Sized up front (before any canvas exists) so the container's total
    // scroll height is correct immediately - pages rendering in later
    // doesn't shift the ones already on screen.
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page';
    wrapper.style.width = `${containerWidth}px`;
    wrapper.style.height = `${viewport.height / dpr}px`;
    container.appendChild(wrapper);
    wrappers.push(wrapper);
  }

  async function renderInto(index: number): Promise<void> {
    const wrapper = wrappers[index];
    const viewport = viewports[index];
    if (!wrapper || !viewport || isCancelled() || wrapper.firstChild) return;
    const page = await doc.getPage(index + 1);
    if (isCancelled()) return;

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    wrapper.appendChild(canvas);
    await page.render({ canvas, viewport }).promise;
  }

  function release(index: number): void {
    wrappers[index]?.replaceChildren();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (isCancelled()) {
        observer.disconnect();
        return;
      }
      for (const entry of entries) {
        const index = wrappers.indexOf(entry.target as HTMLDivElement);
        if (index === -1) continue;
        if (entry.isIntersecting) void renderInto(index);
        else release(index);
      }
    },
    // Keeps roughly a screen's worth of pages rendered ahead/behind the
    // visible area, so scrolling doesn't visibly outrun rendering.
    { rootMargin: '100% 0px' },
  );
  wrappers.forEach((wrapper) => observer.observe(wrapper));

  await renderInto(0);
}
