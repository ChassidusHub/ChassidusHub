import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';

type Look = 'primary' | 'ghost' | 'outline';

/** The main action of a screen (primary), or a quieter one. A link when it has `to`. */
export function Button({
  look = 'primary',
  small,
  icon,
  to,
  children,
  ...rest
}: { look?: Look; small?: boolean; icon?: IconName; to?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = ['btn', look !== 'primary' && look, small && 'small', rest.className].filter(Boolean).join(' ');
  const inside = (
    <>
      {icon && <Icon name={icon} size="s" />}
      {children}
    </>
  );
  if (to) return <Link to={to} className={className}>{inside}</Link>;
  return (
    <button type="button" {...rest} className={className}>
      {inside}
    </button>
  );
}

/** A button that is only an icon; `label` is what a screen reader says. */
export function IconButton({
  icon,
  label,
  on,
  small,
  ...rest
}: { icon: IconName; label: string; on?: boolean; small?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = ['ib', on && 'on', small && 'small', rest.className].filter(Boolean).join(' ');
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={className}>
      <Icon name={icon} />
    </button>
  );
}

/** The round play / pause button. */
export function PlayButton({
  playing,
  size,
  ...rest
}: { playing: boolean; size?: 'small' | 'large' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = ['play', size, rest.className].filter(Boolean).join(' ');
  return (
    <button type="button" aria-label={playing ? 'עצירה' : 'ניגון'} {...rest} className={className}>
      <Icon name={playing ? 'pause' : 'play'} />
    </button>
  );
}
