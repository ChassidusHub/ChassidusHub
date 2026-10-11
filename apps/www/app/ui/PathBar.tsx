import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Menu, type MenuItem } from './Menu';

/** One level of the path: what the page is at that level, and the other choices there. */
export interface PathLevel {
  key: string;
  label: string;
  /** Only the first level has one (the library's books, listening's headphones). */
  icon?: IconName;
  /** The menu's heading: what the choices at this level are ("חלקי ליקוטי שיחות"). */
  title: string;
  /** The choices, or a way to fetch them when the level is opened. */
  items: MenuItem[] | (() => Promise<MenuItem[]>);
}

/**
 * The path bar at the top of a page: the whole path to it (ספרייה › הרבי ›
 * ליקוטי שיחות › חלק י״ב › שמיני א), and every level opens the other choices at
 * that level, as a code editor's path bar does above a file. It is the site's
 * navigation: there is no lone back link. On a phone the bar scrolls sideways,
 * starting at its end, and the choices open as a sheet.
 */
export function PathBar({ levels }: { levels: PathLevel[] }) {
  const bar = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<{ level: PathLevel; anchor: HTMLElement } | null>(null);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [fade, setFade] = useState(false);

  // The page's own level, at the end of the path, is what shows when the bar is too long for the screen.
  useEffect(() => {
    const crumbs = bar.current;
    if (!crumbs) return;
    crumbs.scrollLeft = -crumbs.scrollWidth;
    setFade(crumbs.scrollWidth > crumbs.clientWidth + 2);
  }, [levels]);

  const close = useCallback(() => setOpen(null), []);
  const toggle = async (level: PathLevel, anchor: HTMLElement) => {
    if (open?.level.key === level.key) return close();
    setOpen({ level, anchor });
    if (Array.isArray(level.items)) return setItems(level.items);
    setItems(null);
    try {
      setItems(await level.items());
    } catch {
      setItems([]);
    }
  };

  return (
    <nav ref={bar} className={['crumbs', levels.length > 2 && 'long', fade && 'fade'].filter(Boolean).join(' ')} aria-label="המקום באתר">
      <ol>
        {levels.map((level, at) => (
          <li key={level.key}>
            {at > 0 && <Icon name="chevron-left" className="sep" />}
            <button
              type="button"
              className={at === 0 ? 'crumb root' : 'crumb'}
              aria-haspopup="menu"
              aria-expanded={open?.level.key === level.key}
              aria-current={at === levels.length - 1 ? 'page' : undefined}
              aria-label={at === 0 && level.icon ? level.label : undefined}
              onClick={(event) => toggle(level, event.currentTarget)}
            >
              {level.icon && <Icon name={level.icon} className="ci" />}
              <span className="lbl">{level.label}</span>
              <Icon name="chevron-down" className="dd" />
            </button>
          </li>
        ))}
      </ol>
      <Menu open={!!open} anchor={open?.anchor ?? null} title={open?.level.title ?? ''} items={items} onClose={close} />
    </nav>
  );
}
