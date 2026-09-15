import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from '../i18n/useLanguage';
import { getNavigationDepth } from '../routes/navigationDepth';

interface Props {
  to: string;
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
 * where popping history would leave the app entirely).
 *
 * `getNavigationDepth()` (see routes/navigationDepth.ts) is this app's own
 * sessionStorage-backed count of real steps back available this session -
 * used instead of `window.history.state`'s own `idx` after that turned out
 * not to reliably survive a page reload, a real reported bug: reloading
 * deep in the app and then tapping back could loop instead of ever making
 * it to home, since the fixed-URL fallback kicked in every time instead of
 * only once real history was actually exhausted.
 *
 * The label is always the generic "back," never a per-screen destination
 * name - now that a click usually pops real history rather than landing on
 * the fixed `to` URL, a specific label (e.g. "home") would often describe
 * somewhere the click doesn't actually go.
 */
export function BackLink({ to }: Props) {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const Chevron = language === 'he' ? ChevronRight : ChevronLeft;

  function handleClick(e: MouseEvent<HTMLAnchorElement>): void {
    // A modified click (open in new tab, etc.) should behave like a plain
    // link, not hijack the browser's own handling of it.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (getNavigationDepth() > 0) {
      navigate(-1);
      return;
    }
    // No real history to pop (a fresh load/deep link - the real reported
    // case: Chrome relaunched straight onto a sub-page, a brand-new tab
    // session with no history at all). A plain PUSH to the fixed `to` URL
    // here used to leave a fresh forward entry behind it - which then had
    // real depth of its own, so the *next* tap on that landed screen's own
    // BackLink would navigate(-1) straight back to here instead of
    // continuing upward, bouncing between the two forever without ever
    // reaching home. `replace` never leaves that entry behind, so every
    // fallback tap keeps climbing the logical parent chain instead.
    navigate(to, { replace: true });
  }

  return (
    <Link className="back-link" to={to} onClick={handleClick}>
      <Chevron size={18} strokeWidth={2.5} />
      {t.back}
    </Link>
  );
}
