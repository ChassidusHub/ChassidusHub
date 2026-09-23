import {
  isHighlightedFarbrengenHanacha,
  mafteiachMonthName,
  mafteiachMonthNameHebrew,
  mafteiachMonthToken,
  resolveOccasionAllYears,
  resolveThisWeek,
  resolveThisWeekAllYears,
  sortPdfsByEditionPreference,
} from '@sichos-kodesh/catalog';
import type {
  CatalogByYear,
  CatalogEntry,
  CatalogPdf,
  PdfEdition,
  PdfSection,
  YearOccasionMatches,
  YearWeekOccasions,
} from '@sichos-kodesh/catalog';
import type { Language } from '../i18n/translations';
import type { OccasionRouteParams, RootStackParamList } from '../navigation/types';
import { hebrewDayMonthLabel } from '../utils/formatHebrewDate';

const SECONDARY_SECTIONS = ['mugah', 'maamorim', 'hagahos', 'hosofos'] as const;

export interface MonthGroup {
  monthToken: string;
  monthName: string;
  entries: CatalogEntry[];
}

export type FarbrengenBackRoute =
  | { name: 'ThisWeek'; params: RootStackParamList['ThisWeek']; backLabelKey: 'backToThisWeek' }
  | { name: 'MonthOccasions'; params: RootStackParamList['MonthOccasions']; backLabelKey: 'back' }
  | { name: 'FollowMonthOccasions'; params: RootStackParamList['FollowMonthOccasions']; backLabelKey: 'back' }
  | { name: 'AllYearsThisWeek'; params: undefined; backLabelKey: 'back' }
  | { name: 'Search'; params: undefined; backLabelKey: 'back' }
  | { name: 'Downloaded'; params: undefined; backLabelKey: 'back' }
  | { name: 'OccasionAllYears'; params: RootStackParamList['OccasionAllYears']; backLabelKey: 'back' };

export interface ResolvedOccasionRoute {
  entry: CatalogEntry;
  subtitle: string;
  backRoute: FarbrengenBackRoute;
}

export interface FarbrengenCategoryLink {
  section: PdfSection;
  count: number;
}

export interface SplitFarbrengenContent {
  hanachaPdfs: CatalogPdf[];
  otherPdfs: CatalogPdf[];
  categoryLinks: FarbrengenCategoryLink[];
}

export function entriesWithContentForYear(catalog: CatalogByYear, hebrewYear: number): CatalogEntry[] {
  return (catalog[hebrewYear] ?? []).filter((entry) => entry.audio.length > 0 || entry.pdfs.length > 0);
}

export function monthNameForToken(hebrewYear: number, monthToken: string, language: Language): string {
  const monthNameFor = language === 'he' ? mafteiachMonthNameHebrew : mafteiachMonthName;
  return monthNameFor(`${hebrewYear}-${monthToken}-01`);
}

export function groupEntriesByMonth(entries: CatalogEntry[], language: Language): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const monthToken = mafteiachMonthToken(entry.hebrewDate);
    const last = groups[groups.length - 1];
    if (last && last.monthToken === monthToken) {
      last.entries.push(entry);
      continue;
    }
    groups.push({
      monthToken,
      monthName: monthNameForToken(entry.hebrewYear, monthToken, language),
      entries: [entry],
    });
  }
  return groups;
}

export function findCatalogEntry(catalog: CatalogByYear, hebrewYear: number, occasionId: number): CatalogEntry | null {
  return (catalog[hebrewYear] ?? []).find((entry) => entry.occasionId === occasionId) ?? null;
}

export function resolveOccasionRoute(
  catalog: CatalogByYear,
  route: OccasionRouteParams,
  language: Language,
  today: Date = new Date(),
): ResolvedOccasionRoute | null {
  if (route.kind === 'follow') {
    const thisWeek = resolveThisWeek(route.sourceYear, catalog, today).find(
      (occasion) => occasion.entry.occasionId === route.occasionId,
    );
    const entry = thisWeek?.entry ?? findCatalogEntry(catalog, route.sourceYear, route.occasionId);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      backRoute: thisWeek
        ? { name: 'ThisWeek', params: { sourceYear: route.sourceYear }, backLabelKey: 'backToThisWeek' }
        : {
            name: 'FollowMonthOccasions',
            params: { sourceYear: route.sourceYear, monthToken: mafteiachMonthToken(entry.hebrewDate) },
            backLabelKey: 'back',
          },
    };
  }

  if (route.kind === 'browse') {
    const entry = findCatalogEntry(catalog, route.hebrewYear, route.occasionId);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      backRoute: {
        name: 'MonthOccasions',
        params: { hebrewYear: route.hebrewYear, monthToken: mafteiachMonthToken(entry.hebrewDate) },
        backLabelKey: 'back',
      },
    };
  }

  if (route.kind === 'search' || route.kind === 'downloaded') {
    const entry = findCatalogEntry(catalog, route.hebrewYear, route.occasionId);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      backRoute: {
        name: route.kind === 'search' ? 'Search' : 'Downloaded',
        params: undefined,
        backLabelKey: 'back',
      },
    };
  }

  if (route.kind === 'allYearsThisWeek') {
    const entry = findCatalogEntry(catalog, route.hebrewYear, route.occasionId);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      backRoute: { name: 'AllYearsThisWeek', params: undefined, backLabelKey: 'back' },
    };
  }

  if (route.kind === 'occasionAllYears') {
    const entry = findCatalogEntry(catalog, route.hebrewYear, route.occasionId);
    if (!entry) return null;
    return {
      entry,
      subtitle: hebrewDayMonthLabel(entry.hebrewDate, language),
      backRoute: {
        name: 'OccasionAllYears',
        params: {
          sourceHebrewYear: route.sourceHebrewYear,
          sourceOccasionId: route.sourceOccasionId,
        },
        backLabelKey: 'back',
      },
    };
  }

  return null;
}

export function splitFarbrengenContent(entry: CatalogEntry): SplitFarbrengenContent {
  const hanachaPdfs = entry.pdfs.filter(isHighlightedFarbrengenHanacha);
  const otherPdfs = entry.pdfs.filter(
    (pdf) => pdf.section === 'biltiMugah' && !isHighlightedFarbrengenHanacha(pdf),
  );
  const categoryLinks = SECONDARY_SECTIONS.map((section) => ({
    section,
    count: entry.pdfs.filter((pdf) => pdf.section === section).length,
  })).filter((item) => item.count > 0);
  return { hanachaPdfs, otherPdfs, categoryLinks };
}

export function selectCategoryPdfs(
  entry: CatalogEntry,
  categoryId: PdfSection,
  editionPreference: PdfEdition | null,
): CatalogPdf[] {
  return sortPdfsByEditionPreference(
    entry.pdfs.filter((pdf) => pdf.section === categoryId),
    editionPreference,
  );
}

export function resolveMonthOccasions(
  catalog: CatalogByYear,
  hebrewYear: number,
  monthToken: string,
): CatalogEntry[] {
  return entriesWithContentForYear(catalog, hebrewYear).filter(
    (entry) => mafteiachMonthToken(entry.hebrewDate) === monthToken,
  );
}

export function resolveAllYearsThisWeekGroups(
  catalog: CatalogByYear,
  today: Date = new Date(),
): YearWeekOccasions[] {
  return resolveThisWeekAllYears(catalog, today);
}

export function resolveOccasionAllYearsGroups(
  catalog: CatalogByYear,
  sourceHebrewYear: number,
  sourceOccasionId: number,
): { sourceEntry: CatalogEntry | null; yearGroups: YearOccasionMatches[] } {
  const sourceEntry = findCatalogEntry(catalog, sourceHebrewYear, sourceOccasionId);
  if (!sourceEntry) return { sourceEntry: null, yearGroups: [] };
  return {
    sourceEntry,
    yearGroups: resolveOccasionAllYears(catalog, sourceEntry),
  };
}
