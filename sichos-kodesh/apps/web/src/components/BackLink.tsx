import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
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
 */
export function BackLink({ to, children }: Props) {
  const { language } = useLanguage();
  const Chevron = language === 'he' ? ChevronRight : ChevronLeft;
  return (
    <Link className="back-link" to={to}>
      <Chevron size={18} strokeWidth={2.5} />
      {children}
    </Link>
  );
}
