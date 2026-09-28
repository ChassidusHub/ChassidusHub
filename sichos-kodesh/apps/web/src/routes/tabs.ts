/**
 * The app's five tabs (docs: the UI/UX redo plan, "Navigation"): this week,
 * the farbrengens, the library, search, and the listener's own things. The
 * tab a page belongs to comes from its path alone, so a page opened from a
 * link, a search result or a fresh load lights the same tab as one reached
 * by tapping through.
 */

export type TabId = 'week' | 'farbrengens' | 'library' | 'search' | 'mine';

export const TAB_IDS: readonly TabId[] = ['week', 'farbrengens', 'library', 'search', 'mine'];

/** Where each tab opens. */
export const TAB_ROOTS: Record<TabId, string> = {
  week: '/',
  farbrengens: '/farbrengens',
  library: '/library',
  search: '/search',
  mine: '/me',
};

/** The farbrengens' views: by year, by moed, by parsha. */
export type FarbrengensView = 'year' | 'moed' | 'parsha';

export function farbrengensPath(view: FarbrengensView = 'year'): string {
  return view === 'year' ? TAB_ROOTS.farbrengens : `${TAB_ROOTS.farbrengens}?by=${view}`;
}

/** `path` itself or anything under it. */
function under(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** The tab a page belongs to. */
export function tabForPath(pathname: string): TabId {
  // This week's own ways in, before the library they live under.
  if (under(pathname, '/library/this-parsha')) return 'week';
  if (
    under(pathname, '/farbrengens') ||
    under(pathname, '/years') ||
    under(pathname, '/browse') ||
    under(pathname, '/occasion-all-years') ||
    under(pathname, '/library/moadim') ||
    under(pathname, '/library/parshiyos')
  )
    return 'farbrengens';
  if (under(pathname, '/library') || under(pathname, '/seforim')) return 'library';
  if (under(pathname, '/search')) return 'search';
  if (under(pathname, '/me') || under(pathname, '/settings') || under(pathname, '/downloaded') || under(pathname, '/about') || under(pathname, '/privacy')) return 'mine';
  return 'week';
}

/** Whether a page shows the tabs: every page but a PDF and the seforim reader, which take the whole screen. */
export function showsTabs(pathname: string): boolean {
  if (/\/pdf\//.test(pathname)) return false;
  if (/^\/seforim\/[^/]+\/read$/.test(pathname)) return false;
  return true;
}

/** Whether a page is a tab's own first page, which has no way back - the tabs are the way around. */
export function isTabRoot(pathname: string): boolean {
  return (Object.values(TAB_ROOTS) as string[]).includes(pathname);
}
