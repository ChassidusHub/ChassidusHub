import { HDate } from '@hebcal/core';
import type { CatalogLibrary, LibraryItemBase } from '@sichos-kodesh/catalog';
import { currentParsha, mafteiachMonthToken, toMafteiachHebrewDateKey } from '@sichos-kodesh/catalog';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import { IL } from '../config';
import { libraryItemTargets } from './libraryDownloads';
import { findGroup, findItem, lsParshaSlugs } from '@sichos-kodesh/app-core';

/**
 * Auto-download per collection (docs/offline-plan.md WP4b), on top of the
 * farbrengens' week/month logic and following the same source year(s):
 *
 * - Likkutei Sichos: every sicha on this week's parsha;
 * - maamorim and yomanim: this Hebrew month of the source year;
 * - general letters: the letters of the current moed in the source year.
 *
 * Each is its own switch, off until the user turns it on.
 */

export type LibraryAutoCollection = 'likkuteiSichos' | 'maamorim' | 'yomanim' | 'michtavimKlolim';
export const LIBRARY_AUTO_COLLECTIONS: readonly LibraryAutoCollection[] = ['likkuteiSichos', 'maamorim', 'yomanim', 'michtavimKlolim'];

export type LibraryAutoSettings = Partial<Record<LibraryAutoCollection, boolean>>;

// Found by place in Torah order (app-core), shared with the home screens.
export { lsParshaSlugs };

/** The general letters' moed group for a mafteiach month token. */
export function michtavMoedSlug(monthToken: string): string | null {
  switch (monthToken) {
    case '12':
    case '01':
      return 'elul-tishrei';
    case '02':
      return 'cheshvan';
    case '03':
    case '04':
      return 'kislev-chanuka';
    case '05':
      return 'shevat';
    case '06':
    case '06A':
    case '06B':
      return 'adar';
    case '07':
      return 'nissan';
    case '08':
      return 'iyar-sefiras-haomer';
    case '09':
      return 'sivan';
    case '10':
      return 'tammuz';
    case '11':
      return 'menachem-av';
    default:
      return null;
  }
}

/** Today's month in a source year, as mafteiach tokens it (a leap source year gives 06A/06B). */
export function monthTokenIn(sourceYear: number, today: Date): string {
  const hdate = new HDate(today);
  return mafteiachMonthToken(toMafteiachHebrewDateKey({ year: sourceYear, month: hdate.getMonth(), day: hdate.getDate() }));
}

function itemsOf(library: CatalogLibrary, collection: 'maamorim' | 'yomanim' | 'michtavimKlolim'): LibraryItemBase[] {
  return library.collections[collection].items as LibraryItemBase[];
}

/** The targets the enabled collections want now. Unordered duplicates (a file two items share) are left to the queue, which keys by target. */
export function resolveLibraryAutoTargets(library: CatalogLibrary, enabled: LibraryAutoSettings, sourceYears: number[], today: Date): DownloadTarget[] {
  const targets: DownloadTarget[] = [];

  if (enabled.likkuteiSichos) {
    for (const slug of lsParshaSlugs(library, currentParsha(IL, today).parsha)) {
      const group = findGroup(library, 'likkuteiSichos', 'parsha', slug);
      for (const id of group?.itemIds ?? []) {
        const item = findItem(library, 'likkuteiSichos', id);
        if (item) targets.push(...libraryItemTargets('likkuteiSichos', item));
      }
    }
  }

  for (const sourceYear of sourceYears) {
    const monthToken = monthTokenIn(sourceYear, today);
    if (enabled.maamorim) {
      for (const item of itemsOf(library, 'maamorim')) {
        if (item.hebrewYear === sourceYear && (item as { monthToken?: string }).monthToken === monthToken) targets.push(...libraryItemTargets('maamorim', item));
      }
    }
    if (enabled.yomanim) {
      for (const item of itemsOf(library, 'yomanim')) {
        if (item.hebrewYear === sourceYear && (item as { monthToken?: string }).monthToken === monthToken) targets.push(...libraryItemTargets('yomanim', item));
      }
    }
    if (enabled.michtavimKlolim) {
      const moed = michtavMoedSlug(monthToken);
      for (const item of itemsOf(library, 'michtavimKlolim')) {
        if (item.hebrewYear === sourceYear && (item as { moed?: string }).moed === moed) targets.push(...libraryItemTargets('michtavimKlolim', item));
      }
    }
  }
  return targets;
}
