import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LibraryCollectionId, PdfSection } from '@sichos-kodesh/catalog';
import type { SearchScope } from '@sichos-kodesh/app-core';

/** Which list an occasion was reached from - decides the fallback "back" destination (see routes/catalogRoutes.ts), mirroring the web's distinct /follow, /browse, /this-week-all-years and /occasion-all-years URL families. */
export type OccasionRouteParams =
  | { kind: 'browse'; hebrewYear: number; occasionId: number }
  | { kind: 'follow'; sourceYear: number; occasionId: number }
  | { kind: 'allYearsThisWeek'; hebrewYear: number; occasionId: number }
  | { kind: 'search'; hebrewYear: number; occasionId: number }
  | { kind: 'downloaded'; hebrewYear: number; occasionId: number }
  | {
      kind: 'occasionAllYears';
      sourceHebrewYear: number;
      sourceOccasionId: number;
      hebrewYear: number;
      occasionId: number;
    };

/** Root stack param list - one screen per web route (see apps/web/src/App.tsx). */
export type RootStackParamList = {
  /** Home/year picker - entry point of the app (web: `/`) */
  Home: undefined;

  /** Kvius-matched years for the "follow along" flow (web: `/kvius`) */
  KviusYears: { targetYear: number };

  /** All indexed years for free browsing (web: `/years`) */
  BrowseYears: undefined;

  /** "This week" resolved occasions for one kvius-matched source year (web: `/follow/:sourceYear`) */
  ThisWeek: { sourceYear: number };

  /** A browsed year's months (web: `/browse/:hebrewYear`) */
  YearBrowser: { hebrewYear: number };

  /** All occasions for one month within a browsed year (web: `/browse/:hebrewYear/month/:monthToken`) */
  MonthOccasions: { hebrewYear: number; monthToken: string };

  /** A followed year's months (web: `/follow/:sourceYear/month`) */
  FollowMonthList: { sourceYear: number };

  /** Occasions for one month of a followed year (web: `/follow/:sourceYear/month/:monthToken`) */
  FollowMonthOccasions: { sourceYear: number; monthToken: string };

  /** An occasion's own page */
  Farbrengen: OccasionRouteParams;

  /** An occasion's recordings playlist */
  Recordings: OccasionRouteParams;

  /** One PDF section of an occasion */
  Category: OccasionRouteParams & { categoryId: PdfSection };

  /** In-app PDF reader */
  PdfViewer: {
    hebrewYear: number;
    occasionId: number;
    driveFileId: string;
    resourceKey: string | null;
    label: string;
    /** Set for a library item's PDF (no farbrengen behind it): back goes to the item, and there is no reading position to keep. */
    library?: { collection: LibraryCollectionId; id: string };
  };

  /** The library: every collection beyond the dated farbrengens (Android only; WP4b). */
  Library: undefined;

  /** One collection, on one of its browse axes. */
  LibraryCollection: { collection: LibraryCollectionId; axis?: string };

  /** One group of an axis: a volume, a year, a parsha, a masechta. */
  LibraryGroup: { collection: LibraryCollectionId; axis: string; slug: string };

  /** One item: its facts, files and recordings. */
  LibraryItem: { collection: LibraryCollectionId; id: string };

  /** The seforim of the Rebbeim (catalog schema 3; docs/chabad-library-plan.md WP13). */
  Seforim: undefined;

  /** One sefer: its editions and contents; `path` drills into a part (indexes into the contents). */
  Work: { workId: string; path?: number[] };

  /** One unit of a sefer, in one edition (`source` is its index in the work's sources). */
  Reader: { workId: string; unitId: string; source?: number };

  /** Search the seforim: names everywhere, text in the seforim whose pack is on the phone. */

  /** An author's books on HebrewBooks that no sefer here holds (`authorId` null: the other Chabad books); `series` opens one series. */
  HebrewBooksShelf: { authorId: string | null; series?: number };

  /** Farbrengens by mafteiach's moadim or parshiyos. */
  OccasionGroups: { axis: 'moadim' | 'parshiyos' };

  /** The farbrengens of one moed or parsha, every year. */
  OccasionGroup: { axis: 'moadim' | 'parshiyos'; slug: string };

  /** `scope`: where the search starts looking (the seforim's own search link opens it on the seforim). */
  Search: { scope?: SearchScope } | undefined;

  /** Downloaded content manager (web: `/downloaded`) */
  Downloaded: undefined;

  Settings: undefined;

  /** Download settings (web: `/settings/downloads`) */
  DownloadSettings: undefined;

  /** Settings > Offline packs: the shared folder, imports and exports (Android only; no web route). */
  Offline: undefined;

  About: undefined;

  Privacy: undefined;

  /** Cross-year view of this week (web: `/this-week-all-years`) */
  AllYearsThisWeek: undefined;

  /** An occasion across all available years (web: `/occasion-all-years/:sourceHebrewYear/:sourceOccasionId`) */
  OccasionAllYears: {
    sourceHebrewYear: number;
    sourceOccasionId: number;
  };
};

/** Convenience type helpers for individual screens. */
export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type KviusYearsScreenProps = NativeStackScreenProps<RootStackParamList, 'KviusYears'>;
export type BrowseYearsScreenProps = NativeStackScreenProps<RootStackParamList, 'BrowseYears'>;
export type ThisWeekScreenProps = NativeStackScreenProps<RootStackParamList, 'ThisWeek'>;
export type YearBrowserScreenProps = NativeStackScreenProps<RootStackParamList, 'YearBrowser'>;
export type MonthOccasionsScreenProps = NativeStackScreenProps<RootStackParamList, 'MonthOccasions'>;
export type FollowMonthListScreenProps = NativeStackScreenProps<RootStackParamList, 'FollowMonthList'>;
export type FollowMonthOccasionsScreenProps = NativeStackScreenProps<RootStackParamList, 'FollowMonthOccasions'>;
export type FarbrengenScreenProps = NativeStackScreenProps<RootStackParamList, 'Farbrengen'>;
export type RecordingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Recordings'>;
export type CategoryScreenProps = NativeStackScreenProps<RootStackParamList, 'Category'>;
export type PdfViewerScreenProps = NativeStackScreenProps<RootStackParamList, 'PdfViewer'>;
export type SearchScreenProps = NativeStackScreenProps<RootStackParamList, 'Search'>;
export type DownloadedScreenProps = NativeStackScreenProps<RootStackParamList, 'Downloaded'>;
export type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
export type DownloadSettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'DownloadSettings'>;
export type OfflineScreenProps = NativeStackScreenProps<RootStackParamList, 'Offline'>;
export type LibraryScreenProps = NativeStackScreenProps<RootStackParamList, 'Library'>;
export type LibraryCollectionScreenProps = NativeStackScreenProps<RootStackParamList, 'LibraryCollection'>;
export type LibraryGroupScreenProps = NativeStackScreenProps<RootStackParamList, 'LibraryGroup'>;
export type LibraryItemScreenProps = NativeStackScreenProps<RootStackParamList, 'LibraryItem'>;
export type OccasionGroupsScreenProps = NativeStackScreenProps<RootStackParamList, 'OccasionGroups'>;
export type SeforimScreenProps = NativeStackScreenProps<RootStackParamList, 'Seforim'>;
export type WorkScreenProps = NativeStackScreenProps<RootStackParamList, 'Work'>;
export type ReaderScreenProps = NativeStackScreenProps<RootStackParamList, 'Reader'>;
export type HebrewBooksShelfScreenProps = NativeStackScreenProps<RootStackParamList, 'HebrewBooksShelf'>;
export type OccasionGroupScreenProps = NativeStackScreenProps<RootStackParamList, 'OccasionGroup'>;
export type AboutScreenProps = NativeStackScreenProps<RootStackParamList, 'About'>;
export type PrivacyScreenProps = NativeStackScreenProps<RootStackParamList, 'Privacy'>;
export type AllYearsThisWeekScreenProps = NativeStackScreenProps<RootStackParamList, 'AllYearsThisWeek'>;
export type OccasionAllYearsScreenProps = NativeStackScreenProps<RootStackParamList, 'OccasionAllYears'>;
