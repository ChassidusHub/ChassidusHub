import sprite from './icons.svg?no-inline';

/**
 * The site's line icons: one set, drawn on a 24 px grid with a 1.6 stroke, as
 * the prototype draws them. The shapes live in icons.svg, a file of its own
 * that the browser fetches once and keeps (its name changes with it), and
 * every icon points at its shape there: no page carries the shapes in its
 * scripts or its HTML, so a new icon costs nothing on pages that do not use
 * it. Never an emoji or a typed glyph in place of one.
 */
export const iconNames = [
  'search',
  'home',
  'library',
  'listen',
  'user',
  'moon',
  'sun',
  'chevron-left',
  'chevron-right',
  'chevron-down',
  'more',
  'text',
  'close',
  'pen',
  'copy',
  'share',
  'list',
  'back-15',
  'forward-30',
  'previous',
  'next',
  'scan',
  'versions',
  'flag',
  'check',
  'words',
  'book',
  'key',
  'mail',
  'globe',
  'exit',
  'play',
  'pause',
  'history',
  'talk',
  'download',
  'link',
  'code',
  'people',
  'chevron-up',
  'plus',
  'upload',
  'shield',
] as const;

export type IconName = (typeof iconNames)[number];

/** One icon. `size` s is 16 px, l 24 px; `filled` for the solid play and pause shapes. */
export function Icon({ name, size, filled, className, label }: { name: IconName; size?: 's' | 'l'; filled?: boolean; className?: string; label?: string }) {
  const classes = ['i', size, filled && 'filled', className].filter(Boolean).join(' ');
  return (
    <svg className={classes} viewBox="0 0 24 24" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <use href={`${sprite}#i-${name}`} />
    </svg>
  );
}
