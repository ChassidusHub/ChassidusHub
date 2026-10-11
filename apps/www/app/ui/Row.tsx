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
  chevron = !!to,
}: {
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  /** Before the title: a play button, an icon. */
  start?: ReactNode;
  to?: string;
  onClick?: () => void;
  chevron?: boolean;
}) {
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
  if (to) return <Link to={to} className="row">{inside}</Link>;
  if (onClick) return <button type="button" className="row" onClick={onClick}>{inside}</button>;
  return <div className="row">{inside}</div>;
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="rows">{children}</div>;
}
