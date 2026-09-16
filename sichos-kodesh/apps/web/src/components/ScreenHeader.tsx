import type { ReactNode } from 'react';
import { BackLink } from './BackLink';

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
 * shown). The title is capped to a single line with an ellipsis - this
 * bar is a navigation aid, not a place to wrap a long occasion name
 * across several lines.
 */
export function ScreenHeader({ to, title, className }: Props) {
  return (
    <div className={className ? `screen-header ${className}` : 'screen-header'}>
      <BackLink to={to} />
      <span className="screen-header-title">{title}</span>
    </div>
  );
}
