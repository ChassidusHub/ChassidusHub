import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Icon } from './Icon';
import { SearchField } from './SearchField';
import { Sheet } from './Sheet';
import { usePhone } from './useMedia';

/** One choice in a menu. Without `to` or `onSelect` it is shown greyed: there is nothing there yet. */
export interface MenuItem {
  key: string;
  label: string;
  /** Quiet text at the end: a count, a range of years. */
  end?: string;
  to?: string;
  onSelect?: () => void;
  /** The choice the page is on now. */
  current?: boolean;
  /** Extra words the filter matches (a number for "חלק י״ב": 12). */
  also?: string;
}

/** Long lists get a filter box at the top (the prototype: more than 8). */
const FILTER_FROM = 9;

/** Letters only, for matching: no geresh, gershayim or quotes, so י"ב finds י״ב. */
const plain = (text: string) => text.replace(/[״׳"'`]/g, '').toLowerCase();

/**
 * A list of choices opened from a button: under the button on a desktop, as a
 * sheet from the bottom on a phone. Arrow keys move, Enter picks, Escape
 * closes; a long list can be filtered by typing. `items` null while they load.
 */
export function Menu({ open, anchor, title, items, onClose }: { open: boolean; anchor: HTMLElement | null; title: string; items: MenuItem[] | null; onClose: () => void }) {
  const phone = usePhone();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(-1);
    }
  }, [open]);

  // On a phone the sheet opens before slow choices arrive; once they do, focus moves to the one the page is on.
  const loaded = items !== null;
  useEffect(() => {
    if (!phone || !open || !loaded) return;
    const here = document.querySelector<HTMLElement>('.sheet [role="menu"] [aria-checked="true"]');
    if (here && !here.contains(document.activeElement)) here.focus({ preventScroll: true });
  }, [phone, open, loaded]);

  const shown = useMemo(() => {
    const q = plain(query.trim());
    return (items ?? []).filter((item) => !q || plain(`${item.label} ${item.also ?? ''}`).includes(q));
  }, [items, query]);

  const pick = (item: MenuItem) => {
    item.onSelect?.();
    onClose();
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // The first press lands on the choice the page is on, then the arrows move on from there.
      const here = shown.findIndex((item) => item.current);
      setActive((at) => (!shown.length ? -1 : at < 0 && here >= 0 ? here : (at + step + shown.length) % shown.length));
    } else if (event.key === 'Enter') {
      const item = shown[active] ?? (query ? shown[0] : undefined);
      if (!item) return;
      event.preventDefault();
      (document.getElementById(`mi-${item.key}`) as HTMLElement | null)?.click();
    }
  };

  const list = (
    <div onKeyDown={keys}>
      {(items?.length ?? 0) >= FILTER_FROM && (
        <div className="mf">
          <SearchField size="small" label="סינון" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus={!phone} />
        </div>
      )}
      <div className="ml" role="menu" aria-label={title}>
        {items === null && <div className="mempty">טוען…</div>}
        {items !== null && shown.length === 0 && <div className="mempty">אין התאמות</div>}
        {shown.map((item, at) => {
          const className = ['mi', !item.to && !item.onSelect && 'off', at === active && 'active'].filter(Boolean).join(' ');
          const inside = (
            <>
              <span className="t">{item.label}</span>
              {item.end && <span className="r">{item.end}</span>}
              {item.current && <Icon name="check" className="ck" />}
            </>
          );
          const common = { id: `mi-${item.key}`, className, role: 'menuitemradio', 'aria-checked': !!item.current };
          return item.to ? (
            <Link key={item.key} to={item.to} {...common} onClick={() => pick(item)}>
              {inside}
            </Link>
          ) : (
            <button key={item.key} type="button" {...common} aria-disabled={!item.onSelect || undefined} onClick={() => item.onSelect && pick(item)}>
              {inside}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (phone) {
    return (
      <Sheet open={open} title={title} onClose={onClose}>
        {list}
      </Sheet>
    );
  }
  return open && anchor ? (
    <Popup anchor={anchor} ready={items !== null} onClose={onClose}>
      {list}
    </Popup>
  ) : null;
}

/** The desktop menu, under its button, its start edge on the button's start edge, kept inside the window. */
function Popup({ anchor, ready, onClose, children }: { anchor: HTMLElement; ready: boolean; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const at = anchor.getBoundingClientRect();
    const width = box.current?.offsetWidth ?? 280;
    setPlace({ left: Math.max(8, Math.min(innerWidth - width - 8, at.right - width)), top: at.bottom + 4 });
  }, [anchor]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        anchor.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);
  // Focus moves in once the box is placed and its choices have loaded: a hidden box cannot take focus.
  const placed = place !== null;
  useEffect(() => {
    if (!placed || !ready) return;
    const first = box.current?.querySelector<HTMLElement>('input, [aria-checked="true"], [role^="menuitem"]');
    first?.focus({ preventScroll: true });
    box.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [placed, ready]);
  return createPortal(
    <div ref={box} className="menu" style={place ?? { visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}
