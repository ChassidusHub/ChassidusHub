import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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
  MonthOccasions: { hebrewYear: number; monthName: string };

  /** List of follow-months (stub - parity Phase 1B) */
  FollowMonthList: { sourceYear: number };

  /** Occasions for a specific follow-month (stub) */
  FollowMonthOccasions: { sourceYear: number; monthIndex: number };

  /** Farbrengen detail (stub) */
  Farbrengen: { occasionId: number };

  /** Audio recordings list for an occasion (stub) */
  Recordings: { occasionId: number };

  /** Category listing (stub) */
  Category: { categoryId: string };

  /** In-app PDF reader */
  PdfViewer: {
    hebrewYear: number;
    occasionId: number;
    driveFileId: string;
    resourceKey: string | null;
    label: string;
  };

  /** Search screen (stub) */
  Search: undefined;

  /** Downloaded content manager (stub) */
  Downloaded: undefined;

  /** App settings */
  Settings: undefined;

  /** Download/auto-download settings (stub) */
  DownloadSettings: undefined;

  /** About screen (stub) */
  About: undefined;

  /** All kvius-matched years, this-week view (stub) */
  AllYearsThisWeek: undefined;

  /** An occasion across all available years (stub) */
  OccasionAllYears: { occasionId: number; occasionLabel: string };
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
