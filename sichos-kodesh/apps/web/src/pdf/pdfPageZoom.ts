/** Pinch-zoom cap for the whole document - matches how far real PDF viewers let you zoom in on the fine print. */
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

export interface PdfZoomHandle {
  /**
   * A page just scrolled far enough off-screen for the caller's own
   * IntersectionObserver to release its canvas - resize its wrapper back
   * to the *current* zoom level (not necessarily 1x - the rest of the
   * document may still be zoomed) so its layout stays consistent with
   * every other page while it's empty; the caller's own lazy-render path
   * re-renders its canvas at the current resolution next time it scrolls
   * back into view.
   */
  resizeOffscreenPage: (page: ZoomablePage) => void;
}

interface ZoomCallbacks {
  /** The pinch just ended at `scale` (>1) - re-render every currently-rendered page's canvas at that resolution for real sharpness instead of a stretched-out fit-width bitmap. */
  onSettle: (scale: number) => void;
  /** The document is back to 1x (pinched back down) - re-render every currently-rendered page's canvas back at the normal fit-width resolution right away. */
  onReset: () => void;
}

/**
 * Lets a user pinch-zoom the whole document in place, instead of the
 * browser's native pinch gesture zooming the entire visual viewport
 * (header, back button, everything) - a real reported problem.
 * PdfViewerScreen disables native pinch-zoom (via the viewport meta tag)
 * while it's mounted for exactly this reason, so a two-finger gesture here
 * only ever reaches this code, never the browser's own zoom.
 *
 * Zoom applies to every page together, not just the one under your
 * fingers - a real reported bug with an earlier per-page-only version:
 * scrolling while zoomed in used to snap back to a different, unzoomed
 * page the moment it scrolled into view, which reads as broken, not as a
 * feature. One shared scale/pan state, applied to every page's wrapper on
 * every frame of the gesture, keeps the whole document zoomed together as
 * you scroll through it, the way an actual PDF reader behaves.
 *
 * Ending a pinch hands the new scale to `onSettle` so the caller can
 * re-render every currently-visible page's canvas at real resolution
 * instead of a stretched fit-width bitmap; pinching back down to 1x calls
 * `onReset` to drop them back to the standard fit-width render. Pages
 * that are off-screen (no canvas resident right now) aren't touched by
 * either - `resizeOffscreenPage` just keeps their empty wrapper sized to
 * the current zoom level so scrolling past them doesn't visually jump,
 * and the caller's own lazy-render path renders them at whatever the
 * current zoom happens to be once they're actually scrolled into view.
 *
 * A one-finger drag while zoomed only pans sideways once it's clearly more
 * horizontal than vertical (`AXIS_LOCK_RATIO`) - a vertical or diagonal
 * drag is left completely alone (no `preventDefault`, no style change), so
 * scrolling down through the document keeps working exactly as it does
 * before anything is zoomed. `.pdf-page`'s `touch-action: pan-y`
 * (index.css) is what makes this reliable rather than racy: the browser is
 * told upfront to only ever natively handle *vertical* touch movement on
 * these elements, so it never tries to claim a horizontal drag as its own
 * gesture before our JS gets a chance to decide what it is - "smart
 * scroll": scrolling stays the default, and a deliberate sideways swipe is
 * the one exception that has to earn its own gesture.
 */
export function attachPdfZoom(container: HTMLElement, pages: ZoomablePage[], callbacks: ZoomCallbacks): PdfZoomHandle {
  let scale = 1;
  let panX = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let panStart: { x: number; y: number; panX: number } | null = null;
  let axis: 'horizontal' | 'vertical' | null = null;

  function containerWidth(): number {
    return pages[0]?.baseWidth ?? (container.clientWidth || 400);
  }

  function clampPanX(nextScale: number, nextPanX: number): number {
    const overflow = Math.max(0, (containerWidth() * nextScale - containerWidth()) / 2);
    return Math.max(-overflow, Math.min(overflow, nextPanX));
  }

  function styleFor(page: ZoomablePage): void {
    page.wrapper.style.width = `${page.baseWidth * scale}px`;
    page.wrapper.style.height = `${page.baseHeight * scale}px`;
    page.wrapper.style.transform = panX ? `translateX(${panX}px)` : '';
  }

  function applyLiveStyle(): void {
    pages.forEach(styleFor);
  }

  function endGesture(): void {
    if (pointers.size > 0) return;
    panStart = null;
    axis = null;
    if (scale <= 1.02) {
      scale = 1;
      panX = 0;
      applyLiveStyle();
      callbacks.onReset();
      return;
    }
    callbacks.onSettle(scale);
  }

  container.addEventListener('pointerdown', (e) => {
    // Throws if the browser doesn't consider this pointerId an active one
    // (a real gesture's pointerId always is; this guards against that
    // assumption ever being wrong) - letting it throw here would abort
    // the rest of this handler, silently dropping the pointer this
    // gesture depends on tracking at all.
    try {
      container.setPointerCapture(e.pointerId);
    } catch {
      // Best-effort only - tracking still proceeds without capture.
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      pinchStartScale = scale;
    } else if (pointers.size === 1 && scale > 1) {
      const [p] = [...pointers.values()];
      panStart = { x: p!.x, y: p!.y, panX };
      axis = null;
    }
  });

  container.addEventListener('pointermove', (e) => {
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
  container.addEventListener('pointerup', onPointerEnd);
  container.addEventListener('pointercancel', onPointerEnd);

  return {
    resizeOffscreenPage(page: ZoomablePage) {
      styleFor(page);
    },
  };
}
