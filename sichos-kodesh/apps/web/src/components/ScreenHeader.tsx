import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BackLink } from './BackLink';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  to: string;
  title: ReactNode;
  /** Extra class for a screen whose own container doesn't already provide horizontal padding (see PdfViewerScreen's `screen-header-inset`). */
  className?: string;
  /** One small control on the trailing side (the PDF reader's colours button) - drawn over the spacer, so the title stays centred exactly as without it. */
  action?: ReactNode;
}

/**
 * The back button + page title every screen shows, in a bar at the very
 * top of the page that slides away while scrolling down and comes back on
 * a small scroll up (the phone's Screen does the same) - out of the way
 * while reading a long list or document, a flick away when the way back
 * is wanted. Sits right below ConnectivityBanner in the stacking order
 * (reads its `--connectivity-banner-height` variable, kept live by that
 * component, so the two never overlap regardless of whether the banner is
 * currently shown).
 *
 * The title is centered in the full bar, not just in the space left over
 * after the back button - the trailing `screen-header-spacer` is an
 * invisible, non-interactive copy of BackLink's own icon+label, so it
 * always renders at exactly the same width as the real one and the title
 * sits in a box equally spaced from both edges (see the flex-1
 * `.screen-header-title` rule). A long title steps down a size and wraps
 * onto a second line, balanced, before it is cut short. An `action` is positioned over
 * that spacer rather than beside it, so it never widens the trailing side.
 */
/** Past this many characters a title is set a size smaller (the phone's ScreenHeader does the same). */
const LONG_TITLE = 26;

/** How far a scroll has to move in one step to show or hide the bar - a small scroll up is enough to bring it back. */
const STEP = 6;
/** Near the top of the page the bar always shows. */
const TOP = 64;

/** Whether the bar is stepped aside: from a scroll down past it until a small scroll up. */
function useHiddenOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (y < TOP || dy < -STEP) setHidden(false);
      else if (dy > STEP) setHidden(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return hidden;
}

export function ScreenHeader({ to, title, className, action }: Props) {
  const { t, language } = useTranslation();
  const hidden = useHiddenOnScroll();
  const Chevron = language === 'he' ? ChevronRight : ChevronLeft;

  return (
    <div className={['screen-header', hidden && 'screen-header-hidden', className].filter(Boolean).join(' ')}>
      <BackLink to={to} />
      <span className={typeof title === 'string' && title.length > LONG_TITLE ? 'screen-header-title screen-header-title-long' : 'screen-header-title'}>
        {title}
      </span>
      <span className="screen-header-side">
        <span className="back-link screen-header-spacer" aria-hidden="true">
          <Chevron size={18} strokeWidth={2.5} />
          {t.back}
        </span>
        {action && <span className="screen-header-action">{action}</span>}
      </span>
    </div>
  );
}
