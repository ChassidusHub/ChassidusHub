/**
 * The site's line icons: one set, drawn on a 24 px grid with a 1.6 stroke, as
 * the prototype draws them. The shapes are written once into the page
 * (<IconSprite /> in root.tsx) and every icon points at its shape, so a page
 * of rows with chevrons costs a few bytes an icon. Never an emoji or a typed
 * glyph in place of one.
 */
const shapes = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
  library: '<path d="M5 4v16M10 4v16M14.5 5.2l4.3 14.6"/>',
  listen: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.2"/><rect x="16.5" y="14" width="4" height="6" rx="1.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="19" cy="12" r="1.1"/>',
  text: '<path d="M4 7V5h11v2M9.5 5v14M7.5 19h4M14 12v-1.5h7V12M17.5 10.5V19M16 19h3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.4"/>',
  'back-15': '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v4h4"/>',
  'forward-30': '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4h-4"/>',
  previous: '<path d="M7 6v12"/><path d="M18 6v12l-9-6z"/>',
  next: '<path d="M17 6v12"/><path d="M6 6v12l9-6z"/>',
  scan: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  versions: '<path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/>',
  flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  words: '<path d="M4 6h16M4 10.5h16M4 15h16M10 19.5h10"/>',
  book: '<path d="M12 6.5C10 5 7.5 4.5 4 4.5v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-14c-3.5 0-6 .5-8 2z"/><path d="M12 6.5v14"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>',
} as const;

export type IconName = keyof typeof shapes;
export const iconNames = Object.keys(shapes) as IconName[];

/** One icon. `size` s is 16 px, l 24 px; `filled` for the solid play and pause shapes. */
export function Icon({ name, size, filled, className, label }: { name: IconName; size?: 's' | 'l'; filled?: boolean; className?: string; label?: string }) {
  const classes = ['i', size, filled && 'filled', className].filter(Boolean).join(' ');
  return (
    <svg className={classes} viewBox="0 0 24 24" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** Every icon's shape, once a page, hidden; rendered in root.tsx. */
export function IconSprite() {
  const symbols = Object.entries(shapes)
    .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
    .join('');
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: symbols }} />;
}
