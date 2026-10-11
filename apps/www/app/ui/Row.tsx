import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';

/**
 * One line of a list: a title, a quiet line under it, something at the end
 * (a count, a length), and a chevron when it opens another page. A list of
 * rows goes in <Rows>.
 */
export function Row({
  title,
  sub,
  end,
  start,
  to,
  onClick,
  current,
  chevron = !!to,
}: {
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  /** Before the title: a play button, an icon. */
  start?: ReactNode;
  to?: string;
  onClick?: () => void;
  /** The one the page or the player is on now. */
  current?: boolean;
  chevron?: boolean;
}) {
  const className = current ? 'row cur' : 'row';
  const now = current ? ('true' as const) : undefined;
  const inside = (
    <>
      {start}
      <span className="t">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
      {end != null && <span className="r">{end}</span>}
      {chevron && <Icon name="chevron-left" className="chev" />}
    </>
  );
  if (to) return <Link to={to} className={className} aria-current={now}>{inside}</Link>;
  if (onClick) return <button type="button" className={className} aria-current={now} onClick={onClick}>{inside}</button>;
  return <div className={className}>{inside}</div>;
}

/** A list of rows; `quiet` sets their titles in the normal weight, so the current one stands out (the player's chapters). */
export function Rows({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  return <div className={quiet ? 'rows quiet' : 'rows'}>{children}</div>;
}
