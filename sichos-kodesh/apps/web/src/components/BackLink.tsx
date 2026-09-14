import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useLanguage } from '../i18n/useLanguage';

interface Props {
  to: string;
  children: ReactNode;
}

/**
 * The back-navigation link every screen starts with - one shared icon+label
 * so it reads as one design system rather than each screen inventing its
 * own "< text" convention. Unlike a flex row's child order, a chevron's
 * glyph doesn't mirror itself just because the page is `dir="rtl"` - it has
 * to be swapped for the opposite-pointing icon explicitly to keep meaning
 * "back" (toward the reading-start side) in both directions.
 *
 * `to` is each screen's own computed *logical* parent - correct for the
 * "normal" path into that screen, but a real, reported bug for anyone who
 * arrived some other way (search results, the home page's Continue
 * section resuming straight into a specific chapter/PDF, or the browser's
 * own back/forward): navigating to a fixed URL skips over whatever screen
 * they were actually on, reading as "back" jumping two steps instead of
 * one. When there's a real in-app history entry to return to, this
 * prefers that instead - true "go back," landing wherever the user
 * actually came from - and only falls back to the fixed `to` URL when
 * there isn't one (the screen was reached by a fresh load or deep link,
 * where popping history would leave the app entirely). `history.state.idx`
 * is react-router's own per-entry position counter (stamped on every push
 * - see its `createBrowserHistory`), 0 on the very first entry.
 */
export function BackLink({ to, children }: Props) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const Chevron = language === 'he' ? ChevronRight : ChevronLeft;

  function handleClick(e: MouseEvent<HTMLAnchorElement>): void {
    // A modified click (open in new tab, etc.) should behave like a plain
    // link, not hijack the browser's own handling of it.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) {
      e.preventDefault();
      navigate(-1);
    }
  }

  return (
    <Link className="back-link" to={to} onClick={handleClick}>
      <Chevron size={18} strokeWidth={2.5} />
      {children}
    </Link>
  );
}
