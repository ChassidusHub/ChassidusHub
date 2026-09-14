import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  to: string;
  children: ReactNode;
}

/** The back-navigation link every screen starts with - one shared icon+label so it reads as one design system rather than each screen inventing its own "< text" convention. */
export function BackLink({ to, children }: Props) {
  return (
    <Link className="back-link" to={to}>
      <ChevronLeft size={18} strokeWidth={2.5} />
      {children}
    </Link>
  );
}
