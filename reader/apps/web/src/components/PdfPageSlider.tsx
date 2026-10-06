import { useEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  /** The PDF's page list (renderPdf.ts): one child per page, in order. */
  pages: RefObject<HTMLDivElement | null>;
  count: number;
  /** Whether the chrome has stepped aside (useReadingChrome). */
  hidden: boolean;
  /** Called right after a jump to a page, so the jump doesn't read as a scroll down and hide the slider under the finger (useReadingChrome's `settle`). */
  onJump: () => void;
}

/** The page being read: the last whose top is above this far down the screen. */
const READING_LINE = 0.35;
/** Room kept above a page opened from the slider, for the top bar. */
const BAR_ROOM = 64;

function pageTop(page: Element): number {
  return page.getBoundingClientRect().top + window.scrollY;
}

/**
 * The PDF's page slider (docs: the UI/UX redo plan, "Reader and PDF"):
 * which page of how many is on screen, and a slider to go straight to any
 * other. It steps aside with the rest of the chrome. In Hebrew it runs
 * right to left, like the pages of the sefer.
 */
export function PdfPageSlider({ pages, count, hidden, onJump }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const list = pages.current?.children;
      if (!list || list.length === 0) return;
      const line = window.scrollY + window.innerHeight * READING_LINE;
      let current = 1;
      for (let i = 0; i < list.length; i++) {
        if (pageTop(list[i]!) <= line) current = i + 1;
        else break;
      }
      setPage(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pages, count]);

  const go = (target: number) => {
    setPage(target);
    const node = pages.current?.children[target - 1];
    if (!node) return;
    window.scrollTo({ top: Math.max(0, pageTop(node) - BAR_ROOM), behavior: 'instant' as ScrollBehavior });
    onJump();
  };

  if (count < 2) return null;
  const percent = ((page - 1) / (count - 1)) * 100;
  const label = t.pdfPageOf(page, count);
  return (
    <div className={hidden ? 'pdf-slider pdf-slider-hidden' : 'pdf-slider'} aria-hidden={hidden || undefined}>
      <span className="pdf-slider-label">{label}</span>
      <input
        type="range"
        className="global-player-range pdf-slider-range"
        min={1}
        max={count}
        step={1}
        value={page}
        onChange={(event) => go(Number(event.target.value))}
        aria-label={t.pdfGoToPage}
        aria-valuetext={label}
        tabIndex={hidden ? -1 : undefined}
        style={{ '--global-player-progress': `${percent}%` } as CSSProperties}
      />
    </div>
  );
}
