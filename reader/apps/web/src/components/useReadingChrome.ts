import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

/** How far a scroll has to move in one step to hide or show the chrome - a small scroll up is enough to bring it back. */
const STEP = 6;
/** Near the top of the page the chrome comes back on any scroll. */
const TOP = 80;

/** What a tap on may do its own thing: a link, a button, a note, a sheet. Tapping these never hides or shows the chrome. */
const OWN_TAP = 'a, button, input, select, textarea, label, summary, [role="button"], [role="dialog"], [role="presentation"]';

export interface ReadingChrome {
  /** Whether the bar (and the PDF's page slider) have stepped aside. */
  hidden: boolean;
  /** For the page's own click handler: a tap on the text or the pages hides the chrome, or brings it back. */
  onTap: (event: MouseEvent) => void;
  /** After the page moves itself (a chapter put in above the one on screen): that jump is not the reader scrolling, and must not hide the chrome. */
  settle: () => void;
}

/**
 * The chrome around a reader or a PDF (docs: the UI/UX redo plan, "Reader
 * and PDF"): it steps aside on a scroll down and comes back on a small
 * scroll up, and a tap on the page hides it or brings it back - but not a
 * tap on a link, a button or a note, and not one that ends a text
 * selection.
 */
export function useReadingChrome(): ReadingChrome {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      lastY.current = y;
      if (y < TOP || dy < -STEP) setHidden(false);
      else if (dy > STEP) setHidden(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onTap = useCallback((event: MouseEvent) => {
    if (event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest(OWN_TAP)) return;
    if (window.getSelection()?.toString()) return;
    setHidden((was) => !was);
  }, []);

  const settle = useCallback(() => {
    lastY.current = window.scrollY;
  }, []);

  return { hidden, onTap, settle };
}
