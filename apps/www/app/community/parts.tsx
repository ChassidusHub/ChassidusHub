import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '../ui';
import { count, percent, type Project } from './data';

/**
 * The few pieces the pages about the catalog share: a thin bar of how far
 * something has come (left to right, as every progress bar on the site),
 * a short figure with its words, and a long list whose rows past the first
 * ten fold away until asked for, without script.
 */
export function Meter({ part, whole, label }: { part: number; whole: number; label: string }) {
  const width = whole ? Math.min(100, (part / whole) * 100) : 0;
  return (
    <span className="meter" role="img" aria-label={label}>
      <i style={{ width: `${width}%` }} />
    </span>
  );
}

export function Figure({ big, children }: { big: ReactNode; children: ReactNode }) {
  return (
    <div className="figure">
      <b>{big}</b>
      <span>{children}</span>
    </div>
  );
}

const FOLD = 10;

/** The first ten rows, then the rest behind "הצגת הכל". */
export function Folded<T>({ items, row }: { items: T[]; row: (item: T, at: number) => ReactNode }) {
  return (
    <>
      {items.slice(0, FOLD).map(row)}
      {items.length > FOLD && (
        <details className="fold">
          <summary>
            <span>הצגת הכל ({items.length.toLocaleString('he')})</span>
            <Icon name="chevron-down" size="s" />
          </summary>
          {items.slice(FOLD).map((item, at) => row(item, at + FOLD))}
        </details>
      )}
    </>
  );
}

/** A line of links to the other pages about the catalog, each with its icon. */
export function SeeAlso({ links }: { links: { to: string; icon: IconName; label: string; sub?: string }[] }) {
  return (
    <ul className="links">
      {links.map((link) => (
        <li key={link.to}>
          <Link to={link.to}>
            <Icon name={link.icon} />
            <span>
              {link.label}
              {link.sub && <small className="faint sm"> · {link.sub}</small>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** `54 מתוך 106 · 51%`, under a thin bar. */
export function Progress({ project }: { project: Pick<Project, 'total' | 'done'> }) {
  const words = `${count(project.done)} מתוך ${count(project.total)} · ${percent(project.done, project.total)}`;
  return (
    <span className="progress">
      <Meter part={project.done} whole={project.total} label={words} />
      <span className="faint sm">{words}</span>
    </span>
  );
}
