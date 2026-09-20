import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PdfSection } from '@sichos-kodesh/catalog';

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

/**
 * Root stack param list - mirrors the web app's conceptual screen graph so
 * all routes exist and params are typed, even if some screens are still
 * placeholders pending full parity work.
 */
export type RootStackParamList = {
  /** Home/year picker - entry point of the app */
  Home: undefined;

  /** Kvius-matched years for "follow along" flow */
  KviusYears: { targetYear: number };

  /** All indexed years for free browsing */
  BrowseYears: undefined;

  /** "This week" resolved occasions for one kvius-matched source year */
  ThisWeek: { sourceYear: number };

  /** Every occasion indexed for a single Hebrew year */
  YearBrowser: { hebrewYear: number; initialOccasionId?: number };

  /** All occasions for one month within a year */
  MonthOccasions: { hebrewYear: number; monthToken: string };

  /** List of follow-months (stub - parity Phase 1B) */
  FollowMonthList: { sourceYear: number };

  /** Occasions for a specific follow-month */
  FollowMonthOccasions: { sourceYear: number; monthToken: string };

  /** Farbrengen detail */
  Farbrengen: OccasionRouteParams;

  /** Audio recordings list for an occasion */
  Recordings: OccasionRouteParams;

  /** Category listing */
  Category: OccasionRouteParams & { categoryId: PdfSection };

  /** In-app PDF reader */
  PdfViewer: {
    hebrewYear: number;
    occasionId: number;
    driveFileId: string;
    resourceKey: string | null;
    label: string;
    occasionLabel?: string;
    sectionLabel?: string | null;
  };

  /** Search screen */
  Search: undefined;

  /** Downloaded content manager */
  Downloaded: undefined;

  /** App settings */
  Settings: undefined;

  /** Download settings */
  DownloadSettings: undefined;

  /** About screen (stub) */
  About: undefined;

  /** Cross-year view of this week */
  AllYearsThisWeek: undefined;

  /** An occasion across all available years */
  OccasionAllYears: {
    sourceHebrewYear: number;
    sourceOccasionId: number;
    sourceRoute?: OccasionRouteParams;
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
export type AboutScreenProps = NativeStackScreenProps<RootStackParamList, 'About'>;
export type AllYearsThisWeekScreenProps = NativeStackScreenProps<RootStackParamList, 'AllYearsThisWeek'>;
export type OccasionAllYearsScreenProps = NativeStackScreenProps<RootStackParamList, 'OccasionAllYears'>;
