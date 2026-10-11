import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';

/** A "continue" tile: a small round icon, a kicker, a title and a line under it (Home's continue listening / learning). */
export function Tile({ icon, kicker, title, sub, to, onClick }: { icon: IconName; kicker?: ReactNode; title: ReactNode; sub?: ReactNode; to?: string; onClick?: () => void }) {
  const inside = (
    <>
      <span className="bk">
        <Icon name={icon} />
      </span>
      <span className="tx">
        {kicker && <small>{kicker}</small>}
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
    </>
  );
  if (to) return <Link to={to} className="tile">{inside}</Link>;
  return <button type="button" className="tile" onClick={onClick}>{inside}</button>;
}

/** A box in a grid of boxes: a title in the title face and a line under it (the Rebbeim on Home and in the library). */
export function Box({ title, sub, to }: { title: ReactNode; sub?: ReactNode; to: string }) {
  return (
    <Link to={to} className="box">
      <b>{title}</b>
      {sub && <span>{sub}</span>}
    </Link>
  );
}

/** The heading over a section, with an optional link at its end ("הכול"). */
export function SectionHead({ title, more }: { title: ReactNode; more?: { label: string; to: string } }) {
  return (
    <div className="shead">
      <h2>{title}</h2>
      {more && <Link to={more.to}>{more.label}</Link>}
    </div>
  );
}
