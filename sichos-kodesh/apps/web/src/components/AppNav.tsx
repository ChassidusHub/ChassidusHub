import { Link, useLocation } from 'react-router-dom';
import type { MouseEvent } from 'react';
import { CalendarRange, CircleUserRound, House, Library, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from '../i18n/useLanguage';
import type { TabId } from '../routes/tabs';
import { TAB_IDS, TAB_ROOTS, tabForPath } from '../routes/tabs';

const ICONS: Record<TabId, LucideIcon> = {
  week: House,
  farbrengens: CalendarRange,
  library: Library,
  search: Search,
  mine: CircleUserRound,
};

/**
 * The five tabs: a bar along the bottom on a phone-sized window, a rail
 * down the side on a wide one (index.css, `.app-nav`). A tab opens its
 * first page; the tab already open, tapped on that page, scrolls it back
 * to the top.
 */
export function AppNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current = tabForPath(pathname);

  function onTap(e: MouseEvent<HTMLAnchorElement>, tab: TabId): void {
    if (tab === current && pathname === TAB_ROOTS[tab]) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <nav className="app-nav" aria-label={t.tabBarLabel}>
      {TAB_IDS.map((tab) => {
        const Icon = ICONS[tab];
        const active = tab === current;
        return (
          <Link key={tab} className="app-nav-tab" to={TAB_ROOTS[tab]} aria-current={active ? (pathname === TAB_ROOTS[tab] ? 'page' : 'true') : undefined} onClick={(e) => onTap(e, tab)}>
            <span className="app-nav-icon">
              <Icon size={22} strokeWidth={active ? 2.25 : 1.9} aria-hidden />
            </span>
            <span className="app-nav-label">{t.tabNames[tab]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
