import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { attachPdfZoom } from './pdfPageZoom';
import type { ZoomablePage } from './pdfPageZoom';
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

/**
 * Loads by URL (pdf.js does its own fetch) rather than this app awaiting
 * a full `response.arrayBuffer()` and handing pdf.js the complete bytes -
 * pdf.js can start parsing the document as bytes stream in instead of
 * only once 100% has downloaded, the same "don't wait for the whole file"
 * principle as the audio player's streaming fix.
 *
 * `disableRange: true` is deliberate, not a missed optimization: pdf.js
 * would otherwise probe for byte-range support and, seeing this Worker's
 * `/drive/:fileId` route always claim `Accept-Ranges: bytes` (a separate,
 * pre-existing inaccuracy in `services/media-proxy` - that route never
 * actually reads or forwards a client's Range header, unlike
 * `/jem-audio/:filename`, which genuinely does), could end up trusting a
 * capability that isn't really there. Streaming without ranges still
 * gets the real, available benefit (progressive parse-while-downloading)
 * without risking pdf.js misinterpreting a mismatched response.
 */
export function loadPdfDocument(url: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<PDFDocumentProxy> {
  const task = pdfjsLib.getDocument({
    url,
    disableRange: true,
    wasmUrl: `${BASE_URL}pdf-wasm/`,
    cMapUrl: `${BASE_URL}pdf-cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE_URL}pdf-standard-fonts/`,
  });
  if (onProgress) task.onProgress = onProgress;
  return task.promise;
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
 * A pinch-zoomed page's total resolution multiplier over its fit-width
 * scale, once the gesture settles - reasonable even though every
 * currently-rendered page gets boosted together (see pdfPageZoom.ts's
 * whole-document zoom), since only a handful of pages are ever resident
 * at once (the lazy-render/release cycle below keeps it that way
 * regardless of zoom level).
 */
const MAX_BOOST_MULTIPLIER = 4;

/**
 * Scrolling fast up and down repeatedly fires many IntersectionObserver
 * callbacks in quick succession, each wanting to render a page that
 * another callback, milliseconds later, wants released again before the
 * first render even finished - a real reproduced crash, not a theoretical
 * one. Delaying a *render* by this long (releases stay immediate, so
 * memory is freed right away either way) means a page that's only
 * fleetingly scrolled past during a fast scroll is usually released again
 * before its render was ever scheduled, instead of every fleeting pass
 * kicking off its own doc.getPage()/page.render() call.
 */
const RENDER_DEBOUNCE_MS = 120;

interface PageEntry extends ZoomablePage {
  cssScale: number;
}

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
 * Also wires up `pdfPageZoom.ts`'s whole-document pinch-zoom: every
 * currently-rendered page re-renders at up to `MAX_BOOST_MULTIPLIER` its
 * fit-width resolution once a pinch settles (real sharpness, not a
 * stretched fit-width bitmap), together, so scrolling through a zoomed
 * document doesn't snap back to an unzoomed page the moment it scrolls
 * into view - a real reported bug with an earlier per-page-only version.
 * Pinching back down to 1x drops every rendered page back to the standard
 * fit-width render the same way.
 *
 * Resolves once the first page has rendered (so the screen has real
 * content to show), not once every page has - the rest render as the
 * user scrolls. `isCancelled` doubles as the teardown signal: once it
 * returns true the IntersectionObserver disconnects itself on its next
 * callback, so callers don't need to hold a separate handle to it.
 *
 * Every render is tagged with a per-page generation number that `release`
 * bumps - a real, reproduced crash came from scrolling fast enough that a
 * page's render was still in flight (an async `doc.getPage()` +
 * `page.render()` call) when the same page scrolled back off-screen and
 * got released; the stale render would then finish and re-attach its
 * canvas to a wrapper that was supposed to be empty, and doing this
 * repeatedly during fast up-and-down scrolling piled up canvases faster
 * than the browser could reclaim their memory. A render only ever commits
 * its canvas if its generation is still the current one for that page.
 *
 * `onZoomChange`, when given, fires `true` once a pinch settles and
 * `false` once the document is back to 1x - PdfViewerScreen uses it to
 * drop the screen's own side padding and width cap while zoomed, so
 * panning around a zoomed page actually has the full screen to work with
 * instead of the normal reading-width column.
 */
export async function renderPdfPages(
  doc: PDFDocumentProxy,
  container: HTMLElement,
  isCancelled: () => boolean,
  onZoomChange?: (zoomed: boolean) => void,
): Promise<void> {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const containerWidth = container.clientWidth || 400;

  const pages: PageEntry[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    if (isCancelled()) return;
    const page = await doc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const cssScale = containerWidth / unscaledViewport.width;
    const fitViewport = page.getViewport({ scale: cssScale * dpr });

    // Sized up front (before any canvas exists) so the container's total
    // scroll height is correct immediately - pages rendering in later
    // doesn't shift the ones already on screen.
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page';
    const baseWidth = containerWidth;
    const baseHeight = fitViewport.height / dpr;
    wrapper.style.width = `${baseWidth}px`;
    wrapper.style.height = `${baseHeight}px`;
    container.appendChild(wrapper);
    pages.push({ wrapper, baseWidth, baseHeight, cssScale });
  }

  const renderGeneration: number[] = pages.map(() => 0);
  const pendingRenderTimers: Array<ReturnType<typeof setTimeout> | null> = pages.map(() => null);
  // The current effective resolution multiplier over each page's fit-width
  // `cssScale` - `dpr` at rest, boosted (up to `MAX_BOOST_MULTIPLIER`)
  // while the document is pinch-zoomed, so a page that scrolls into view
  // *while* still zoomed renders sharp immediately instead of fit-width
  // and then needing a second re-render.
  let currentRenderScale = dpr;

  async function renderCanvasAtScale(index: number, scale: number, generation: number): Promise<void> {
    const entry = pages[index];
    if (!entry || isCancelled() || renderGeneration[index] !== generation) return;
    const page = await doc.getPage(index + 1);
    if (isCancelled() || renderGeneration[index] !== generation) return;

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      await page.render({ canvas, viewport }).promise;
    } catch {
      return; // Cancelled (e.g. pdf.js itself superseding this render) or failed - nothing to commit.
    }
    if (isCancelled() || renderGeneration[index] !== generation) return;
    entry.wrapper.replaceChildren(canvas);
  }

  function renderInto(index: number): Promise<void> {
    const entry = pages[index];
    if (!entry || isCancelled() || entry.wrapper.firstChild) return Promise.resolve();
    const generation = ++renderGeneration[index]!;
    return renderCanvasAtScale(index, entry.cssScale * currentRenderScale, generation);
  }

  function release(index: number): void {
    const timer = pendingRenderTimers[index];
    if (timer != null) {
      clearTimeout(timer);
      pendingRenderTimers[index] = null;
    }
    renderGeneration[index]!++;
    pages[index]?.wrapper.replaceChildren();
    const entry = pages[index];
    if (entry) zoom.resizeOffscreenPage(entry);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (isCancelled()) {
        observer.disconnect();
        return;
      }
      for (const entry of entries) {
        const index = pages.findIndex((p) => p.wrapper === entry.target);
        if (index === -1) continue;
        if (entry.isIntersecting) {
          if (pendingRenderTimers[index] != null) continue;
          pendingRenderTimers[index] = setTimeout(() => {
            pendingRenderTimers[index] = null;
            void renderInto(index);
          }, RENDER_DEBOUNCE_MS);
        } else {
          release(index);
        }
      }
    },
    // Keeps roughly a screen's worth of pages rendered ahead/behind the
    // visible area, so scrolling doesn't visibly outrun rendering.
    { rootMargin: '100% 0px' },
  );

  /** Every page whose wrapper currently has a canvas resident - the only ones worth re-rendering when the zoom level changes; an off-screen page with no canvas will simply render at `currentRenderScale` whenever it's next scrolled into view. */
  function renderedIndexes(): number[] {
    return pages.reduce<number[]>((acc, entry, index) => {
      if (entry.wrapper.firstChild) acc.push(index);
      return acc;
    }, []);
  }

  const zoom = attachPdfZoom(container, pages, {
    onSettle: (pinchScale) => {
      currentRenderScale = Math.min(dpr * pinchScale, MAX_BOOST_MULTIPLIER);
      for (const index of renderedIndexes()) {
        const entry = pages[index]!;
        const generation = ++renderGeneration[index]!;
        void renderCanvasAtScale(index, entry.cssScale * currentRenderScale, generation);
      }
      onZoomChange?.(true);
    },
    onReset: () => {
      currentRenderScale = dpr;
      for (const index of renderedIndexes()) {
        const entry = pages[index]!;
        const generation = ++renderGeneration[index]!;
        void renderCanvasAtScale(index, entry.cssScale * currentRenderScale, generation);
      }
      onZoomChange?.(false);
    },
  });

  pages.forEach(({ wrapper }) => observer.observe(wrapper));

  await renderInto(0);
}
