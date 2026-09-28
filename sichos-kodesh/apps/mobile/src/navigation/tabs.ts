import type { RootStackParamList } from './types';

/**
 * The app's five tabs (docs: the UI/UX redo plan, "Navigation"; the web's
 * apps/web/src/routes/tabs.ts): this week, the farbrengens, the library,
 * search, and the listener's own things. On the phone the tabs sit over the
 * one stack: a screen belongs to a tab by its name, and a farbrengen or a
 * PDF - opened from anywhere - to the tab of the screen it was opened from.
 */

export type TabId = 'week' | 'farbrengens' | 'library' | 'search' | 'mine';

export const TAB_IDS: readonly TabId[] = ['week', 'farbrengens', 'library', 'search', 'mine'];

type RouteName = keyof RootStackParamList;

/** Where each tab opens. */
export const TAB_ROOTS: Record<TabId, RouteName> = {
  week: 'Home',
  farbrengens: 'Farbrengens',
  library: 'Library',
  search: 'Search',
  mine: 'Mine',
};

/** The farbrengens' views: by year, by moed, by parsha. */
export type FarbrengensView = 'year' | 'moed' | 'parsha';

/** Each screen's own tab; a screen missing here takes the tab of the one under it. */
const SCREEN_TABS: Partial<Record<RouteName, TabId>> = {
  Home: 'week',
  KviusYears: 'week',
  ThisWeek: 'week',
  FollowMonthList: 'week',
  FollowMonthOccasions: 'week',
  AllYearsThisWeek: 'week',

  Farbrengens: 'farbrengens',
  YearBrowser: 'farbrengens',
  MonthOccasions: 'farbrengens',
  OccasionGroup: 'farbrengens',
  OccasionAllYears: 'farbrengens',

  Library: 'library',
  LibraryCollection: 'library',
  LibraryGroup: 'library',
  LibraryItem: 'library',
  Rebbe: 'library',
  Work: 'library',
  HebrewBooksShelf: 'library',

  Search: 'search',

  Mine: 'mine',
  Settings: 'mine',
  DownloadSettings: 'mine',
  Downloaded: 'mine',
  Offline: 'mine',
  About: 'mine',
  Privacy: 'mine',
};

/** The tab lit for a stack of screens, bottom first: the top screen's own, else the nearest one's under it. */
export function tabForStack(names: readonly string[]): TabId {
  for (let i = names.length - 1; i >= 0; i--) {
    const tab = SCREEN_TABS[names[i] as RouteName];
    if (tab) return tab;
  }
  return 'week';
}

/** Whether a screen shows the tabs: every one but a PDF and the seforim reader, which take the whole screen. */
export function showsTabs(name: string | undefined): boolean {
  return name !== 'PdfViewer' && name !== 'Reader';
}

/** The stack a tab opens on: its first screen over This week's, so Back from any tab lands on This week. */
export function tabStack(tab: TabId): Array<{ name: RouteName }> {
  return tab === 'week' ? [{ name: 'Home' }] : [{ name: 'Home' }, { name: TAB_ROOTS[tab] }];
}
