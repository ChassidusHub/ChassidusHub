import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BackLink } from './BackLink';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  to: string;
  title: ReactNode;
  /** Extra class for a screen whose own container doesn't already provide horizontal padding (see PdfViewerScreen's `screen-header-inset`). */
  className?: string;
}

/**
 * The back button + page title every screen shows, pinned to the top of
 * the viewport once scrolled past instead of scrolling away with the rest
 * of the page - a long list or document would otherwise lose its own name
 * and its way back the moment you scroll a screen's height down. Sits
 * right below ConnectivityBanner in the stacking order (reads its
 * `--connectivity-banner-height` variable, kept live by that component,
 * so the two never overlap regardless of whether the banner is currently
 * shown).
 *
 * The title is centered in the full bar, not just in the space left over
 * after the back button - the trailing `screen-header-spacer` is an
 * invisible, non-interactive copy of BackLink's own icon+label, so it
 * always renders at exactly the same width as the real one and the title
 * sits in a box equally spaced from both edges (see the flex-1
 * `.screen-header-title` rule). A title too long to fit centered just
 * fills that box edge to edge with its own ellipsis, which reads the same
 * as ordinary start-aligned truncation.
 */
export function ScreenHeader({ to, title, className }: Props) {
  const { t, language } = useTranslation();
  const Chevron = language === 'he' ? ChevronRight : ChevronLeft;
  return (
    <div className={className ? `screen-header ${className}` : 'screen-header'}>
      <BackLink to={to} />
      <span className="screen-header-title">{title}</span>
      <span className="back-link screen-header-spacer" aria-hidden="true">
        <Chevron size={18} strokeWidth={2.5} />
        {t.back}
      </span>
    </div>
  );
}
