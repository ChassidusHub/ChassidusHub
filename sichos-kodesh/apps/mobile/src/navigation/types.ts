import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PdfSection } from '@sichos-kodesh/catalog';

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
  };

  Search: undefined;

  /** Downloaded content manager (web: `/downloaded`) */
  Downloaded: undefined;

  Settings: undefined;

  /** Download settings (web: `/settings/downloads`) */
  DownloadSettings: undefined;

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
export type AboutScreenProps = NativeStackScreenProps<RootStackParamList, 'About'>;
export type PrivacyScreenProps = NativeStackScreenProps<RootStackParamList, 'Privacy'>;
export type AllYearsThisWeekScreenProps = NativeStackScreenProps<RootStackParamList, 'AllYearsThisWeek'>;
export type OccasionAllYearsScreenProps = NativeStackScreenProps<RootStackParamList, 'OccasionAllYears'>;
