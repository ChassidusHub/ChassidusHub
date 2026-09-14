/** Pinch-zoom cap for a single page - matches how far real PDF viewers let you zoom in on one page's fine print, not a whole-document zoom level. */
const MAX_PINCH_SCALE = 3;

/** A one-finger drag needs to move at least this many px before its direction counts for anything - otherwise the inevitable few px of jitter at the start of every touch would get classified as a real gesture. */
const AXIS_LOCK_THRESHOLD_PX = 8;
/** How much more one axis has to dominate the other before a drag commits to being a sideways pan instead of the default vertical scroll. */
const AXIS_LOCK_RATIO = 1.4;

export interface ZoomablePage {
  wrapper: HTMLDivElement;
  baseWidth: number;
  baseHeight: number;
}

export interface PdfPageZoomHandle {
  /**
   * A page just scrolled far enough off-screen for the caller's own
   * IntersectionObserver to release its canvas - if it was the zoomed
   * page, reset its size back to normal too, but don't re-render it (it's
   * off-screen; the caller's own lazy-render path already re-renders it
   * at standard resolution next time it scrolls back into view).
   */
  resetIfZoomedOffscreen: (index: number) => void;
}

interface ZoomCallbacks {
  /** A pinch on `index` just ended at `scale` (>1) - render its canvas at that resolution for real sharpness instead of a stretched-out fit-width bitmap. */
  onSettle: (index: number, scale: number) => void;
  /** `index` is no longer the zoomed page (a pinch on a different page took over, or this one was pinched back down to 1x) while still on-screen - render its canvas back at the normal fit-width resolution right away. */
  onRelease: (index: number) => void;
}

/**
 * Lets a user pinch-zoom a single page of the PDF in place, instead of the
 * browser's native pinch gesture zooming the entire visual viewport
 * (header, back button, everything) - a real reported problem.
 * PdfViewerScreen disables native pinch-zoom (via the viewport meta tag)
 * while it's mounted for exactly this reason, so a two-finger gesture here
 * only ever reaches this code, never the browser's own zoom.
 *
 * Zoom is per-page and exclusive - only one page is ever enlarged at a
 * time (starting a pinch on a different page releases whichever one was
 * zoomed before), matching how a document is actually read: zoom in on
 * one page's small print, not the whole scroll at once. Ending a pinch
 * hands the new scale to `onSettle` so the caller can re-render that
 * page's canvas at real resolution ("focused" page loads a higher
 * quality); losing focus (`onRelease`/`resetIfZoomedOffscreen`) reverts it
 * to the standard fit-width render instead of keeping the boosted one
 * resident.
 *
 * A one-finger drag on an already-zoomed page only pans sideways once it's
 * clearly more horizontal than vertical (`AXIS_LOCK_RATIO`) - a vertical
 * or diagonal drag is left completely alone (no `preventDefault`, no style
 * change), so scrolling down through the document keeps working exactly
 * as it does before anything is zoomed. `.pdf-page`'s `touch-action:
 * pan-y` (index.css) is what makes this reliable rather than racy: the
 * browser is told upfront to only ever natively handle *vertical* touch
 * movement on this element, so it never tries to claim a horizontal drag
 * as its own gesture before our JS gets a chance to decide what it is -
 * "smart scroll": scrolling stays the default, and a deliberate sideways
 * swipe is the one exception that has to earn its own gesture.
 */
export function attachPdfPageZoom(pages: ZoomablePage[], callbacks: ZoomCallbacks): PdfPageZoomHandle {
  let zoomedIndex: number | null = null;

  function resetStyle(page: ZoomablePage): void {
    page.wrapper.style.width = `${page.baseWidth}px`;
    page.wrapper.style.height = `${page.baseHeight}px`;
    page.wrapper.style.transform = '';
  }

  function releaseIndex(index: number): void {
    if (zoomedIndex !== index) return;
    zoomedIndex = null;
    const page = pages[index];
    if (page) resetStyle(page);
    callbacks.onRelease(index);
  }

  pages.forEach((page, index) => {
    const { wrapper } = page;
    const pointers = new Map<number, { x: number; y: number }>();
    let scale = 1;
    let panX = 0;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let panStart: { x: number; y: number; panX: number } | null = null;
    let axis: 'horizontal' | 'vertical' | null = null;

    function clampPanX(nextScale: number, nextPanX: number): number {
      const overflow = Math.max(0, (page.baseWidth * nextScale - page.baseWidth) / 2);
      return Math.max(-overflow, Math.min(overflow, nextPanX));
    }

    function applyLiveStyle(): void {
      wrapper.style.width = `${page.baseWidth * scale}px`;
      wrapper.style.height = `${page.baseHeight * scale}px`;
      wrapper.style.transform = panX ? `translateX(${panX}px)` : '';
    }

    function endGesture(): void {
      if (pointers.size > 0) return;
      panStart = null;
      axis = null;
      if (zoomedIndex !== index) return;
      if (scale <= 1.02) {
        scale = 1;
        panX = 0;
        releaseIndex(index);
        return;
      }
      callbacks.onSettle(index, scale);
    }

    wrapper.addEventListener('pointerdown', (e) => {
      // Throws if the browser doesn't consider this pointerId an active
      // one (a real gesture's pointerId always is; this guards against
      // that assumption ever being wrong) - letting it throw here would
      // abort the rest of this handler, silently dropping the pointer
      // this gesture depends on tracking at all.
      try {
        wrapper.setPointerCapture(e.pointerId);
      } catch {
        // Best-effort only - tracking still proceeds without capture.
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        if (zoomedIndex !== null && zoomedIndex !== index) releaseIndex(zoomedIndex);
        zoomedIndex = index;
        const [a, b] = [...pointers.values()];
        pinchStartDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        pinchStartScale = scale;
      } else if (pointers.size === 1 && scale > 1) {
        const [p] = [...pointers.values()];
        panStart = { x: p!.x, y: p!.y, panX };
        axis = null;
      }
    });

    wrapper.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2 && pinchStartDist > 0) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        scale = Math.min(MAX_PINCH_SCALE, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
        panX = clampPanX(scale, panX);
        applyLiveStyle();
        e.preventDefault();
        return;
      }

      if (pointers.size === 1 && panStart && scale > 1) {
        const p = pointers.get(e.pointerId)!;
        const dx = p.x - panStart.x;
        const dy = p.y - panStart.y;

        if (axis === null) {
          if (Math.abs(dx) + Math.abs(dy) < AXIS_LOCK_THRESHOLD_PX) return;
          axis = Math.abs(dx) > Math.abs(dy) * AXIS_LOCK_RATIO ? 'horizontal' : 'vertical';
        }
        if (axis === 'vertical') return; // Not our gesture - let the page scroll normally.

        panX = clampPanX(scale, panStart.panX + dx);
        applyLiveStyle();
        e.preventDefault();
      }
    });

    function onPointerEnd(e: PointerEvent): void {
      pointers.delete(e.pointerId);
      if (pointers.size <= 1) pinchStartDist = 0;
      endGesture();
    }
    wrapper.addEventListener('pointerup', onPointerEnd);
    wrapper.addEventListener('pointercancel', onPointerEnd);
  });

  return {
    resetIfZoomedOffscreen(index: number) {
      if (zoomedIndex !== index) return;
      zoomedIndex = null;
      const page = pages[index];
      if (page) resetStyle(page);
    },
  };
}
