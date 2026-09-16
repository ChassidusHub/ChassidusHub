import { useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import { PlayerProvider } from './player/PlayerProvider';
import { DownloadProvider } from './download/DownloadProvider';
import { useAutoDownloadSync } from './download/useAutoDownloadSync';
import { useDownloadRetention } from './download/useDownloadRetention';
import { useConnectivityRecheckTriggers } from './network/useConnectivityRecheckTriggers';
import { adjustNavigationDepth } from './routes/navigationDepth';
import { usePlayer } from './player/usePlayer';
import { LanguageProvider } from './i18n/LanguageProvider';
import { useTranslation } from './i18n/useLanguage';
import { GlobalPlayerBar } from './components/GlobalPlayerBar';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import { DownloadProgressBar } from './components/DownloadProgressBar';
import { useActiveDownloads } from './download/useActiveDownloads';
import { YearPickerScreen } from './screens/YearPickerScreen';
import { KviusYearsScreen } from './screens/KviusYearsScreen';
import { BrowseYearsScreen } from './screens/BrowseYearsScreen';
import { ThisWeekScreen } from './screens/ThisWeekScreen';
import { YearBrowserScreen } from './screens/YearBrowserScreen';
import { MonthOccasionsScreen } from './screens/MonthOccasionsScreen';
import { FollowMonthListScreen } from './screens/FollowMonthListScreen';
import { FollowMonthOccasionsScreen } from './screens/FollowMonthOccasionsScreen';
import { FarbrengenScreen } from './screens/FarbrengenScreen';
import { AllYearsThisWeekScreen } from './screens/AllYearsThisWeekScreen';
import { OccasionAllYearsScreen } from './screens/OccasionAllYearsScreen';
import { RecordingsScreen } from './screens/RecordingsScreen';
import { CategoryScreen } from './screens/CategoryScreen';
import { PdfViewerScreen } from './screens/PdfViewerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DownloadSettingsScreen } from './screens/DownloadSettingsScreen';
import { DownloadedScreen } from './screens/DownloadedScreen';
import { AboutScreen } from './screens/AboutScreen';
import { SearchScreen } from './screens/SearchScreen';
import { useFollowEntry, useBrowseEntry, useThisWeekAllYearsEntry, useOccasionAllYearsEntry } from './routes/useResolvedEntry';

function ThisWeekRoute() {
  const { sourceYear } = useParams<{ sourceYear: string }>();
  return <ThisWeekScreen sourceYear={Number(sourceYear)} />;
}

function YearBrowserRoute() {
  const { hebrewYear } = useParams<{ hebrewYear: string }>();
  return <YearBrowserScreen hebrewYear={Number(hebrewYear)} />;
}

function MonthOccasionsRoute() {
  const { hebrewYear, monthToken } = useParams<{ hebrewYear: string; monthToken: string }>();
  return <MonthOccasionsScreen hebrewYear={Number(hebrewYear)} monthToken={monthToken ?? ''} />;
}

function FollowMonthListRoute() {
  const { sourceYear } = useParams<{ sourceYear: string }>();
  return <FollowMonthListScreen sourceYear={Number(sourceYear)} />;
}

function FollowMonthOccasionsRoute() {
  const { sourceYear, monthToken } = useParams<{ sourceYear: string; monthToken: string }>();
  return <FollowMonthOccasionsScreen sourceYear={Number(sourceYear)} monthToken={monthToken ?? ''} />;
}

function FollowOccasionRoute() {
  return <FarbrengenScreen resolved={useFollowEntry()} />;
}

function BrowseOccasionRoute() {
  return <FarbrengenScreen resolved={useBrowseEntry()} />;
}

function ThisWeekAllYearsOccasionRoute() {
  return <FarbrengenScreen resolved={useThisWeekAllYearsEntry()} />;
}

function OccasionAllYearsRoute() {
  const { sourceHebrewYear, sourceOccasionId } = useParams<{ sourceHebrewYear: string; sourceOccasionId: string }>();
  return <OccasionAllYearsScreen sourceHebrewYear={Number(sourceHebrewYear)} sourceOccasionId={Number(sourceOccasionId)} />;
}

function OccasionAllYearsOccasionRoute() {
  return <FarbrengenScreen resolved={useOccasionAllYearsEntry()} />;
}

/** `resolved` can be null (a stale/bad URL) - RecordingsScreen/CategoryScreen/PdfViewerScreen all need a real entry, so fall back to "not found" rather than passing null through. */
function NotFound() {
  const { t } = useTranslation();
  return <p className="gap-message">{t.pageNotFound}</p>;
}

function FollowRecordingsRoute() {
  const resolved = useFollowEntry();
  return resolved ? <RecordingsScreen resolved={resolved} /> : <NotFound />;
}
function BrowseRecordingsRoute() {
  const resolved = useBrowseEntry();
  return resolved ? <RecordingsScreen resolved={resolved} /> : <NotFound />;
}
function ThisWeekAllYearsRecordingsRoute() {
  const resolved = useThisWeekAllYearsEntry();
  return resolved ? <RecordingsScreen resolved={resolved} /> : <NotFound />;
}
function OccasionAllYearsRecordingsRoute() {
  const resolved = useOccasionAllYearsEntry();
  return resolved ? <RecordingsScreen resolved={resolved} /> : <NotFound />;
}
function FollowCategoryRoute() {
  const resolved = useFollowEntry();
  return resolved ? <CategoryScreen resolved={resolved} /> : <NotFound />;
}
function BrowseCategoryRoute() {
  const resolved = useBrowseEntry();
  return resolved ? <CategoryScreen resolved={resolved} /> : <NotFound />;
}
function ThisWeekAllYearsCategoryRoute() {
  const resolved = useThisWeekAllYearsEntry();
  return resolved ? <CategoryScreen resolved={resolved} /> : <NotFound />;
}
function OccasionAllYearsCategoryRoute() {
  const resolved = useOccasionAllYearsEntry();
  return resolved ? <CategoryScreen resolved={resolved} /> : <NotFound />;
}
function FollowPdfRoute() {
  const resolved = useFollowEntry();
  const { driveFileId } = useParams<{ driveFileId: string }>();
  return resolved ? <PdfViewerScreen key={driveFileId} resolved={resolved} /> : <NotFound />;
}
function BrowsePdfRoute() {
  const resolved = useBrowseEntry();
  const { driveFileId } = useParams<{ driveFileId: string }>();
  return resolved ? <PdfViewerScreen key={driveFileId} resolved={resolved} /> : <NotFound />;
}
function ThisWeekAllYearsPdfRoute() {
  const resolved = useThisWeekAllYearsEntry();
  const { driveFileId } = useParams<{ driveFileId: string }>();
  return resolved ? <PdfViewerScreen key={driveFileId} resolved={resolved} /> : <NotFound />;
}
function OccasionAllYearsPdfRoute() {
  const resolved = useOccasionAllYearsEntry();
  const { driveFileId } = useParams<{ driveFileId: string }>();
  return resolved ? <PdfViewerScreen key={driveFileId} resolved={resolved} /> : <NotFound />;
}

function Home() {
  return <YearPickerScreen targetYear={currentHebrewYear()} />;
}

function KviusYearsRoute() {
  return <KviusYearsScreen targetYear={currentHebrewYear()} />;
}

/**
 * React Router doesn't reset scroll on navigation - without this, a
 * screen reached with the previous screen scrolled down opens already
 * scrolled down too. Runs on every pathname change, including into a
 * PDF - PdfViewerScreen then restores its own saved reading position
 * afterward, once its content has loaded, so a PDF already being read
 * still lands back where it left off rather than at the top.
 */
function useScrollToTopOnNavigate(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

/**
 * Keeps `navigationDepth.ts`'s sessionStorage counter in sync with every
 * real navigation - `useNavigationType()` reports how *this* transition
 * happened: 'PUSH' (a Link/navigate() call) increments it, 'POP' (the
 * browser's own back/forward, including BackLink's own `navigate(-1)`)
 * decrements it, 'REPLACE' leaves it alone. The very first render (the
 * initial load, including right after a reload) is skipped rather than
 * treated as a navigation - whatever depth was already persisted from
 * before is exactly what should carry over.
 */
function useTrackNavigationDepth(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (navigationType === 'PUSH') adjustNavigationDepth(1);
    else if (navigationType === 'POP') adjustNavigationDepth(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on location.key (a fresh value per real navigation entry, pop or push alike), not navigationType, which is stable enough across renders of the same entry to not need separate tracking here.
  }, [location.key]);
}

function AppContent() {
  const player = usePlayer();
  const { count: activeDownloadCount } = useActiveDownloads();
  useScrollToTopOnNavigate();
  useTrackNavigationDepth();
  useAutoDownloadSync();
  useDownloadRetention();
  useConnectivityRecheckTriggers();
  // `has-player`/`has-download-bar` add bottom padding to routed content -
  // GlobalPlayerBar and DownloadProgressBar are both `position: fixed` and
  // can appear over any screen, so without this their combined height
  // would cover, and block clicks on, the last bit of content.
  const bottomBarClass = [player.playlist ? 'has-player' : '', activeDownloadCount > 0 ? 'has-download-bar' : ''].filter(Boolean).join(' ');
  return (
    <div className={['app-content', bottomBarClass].filter(Boolean).join(' ')}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/kvius" element={<KviusYearsRoute />} />
        <Route path="/years" element={<BrowseYearsScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/settings/downloads" element={<DownloadSettingsScreen />} />
        <Route path="/downloaded" element={<DownloadedScreen />} />
        <Route path="/about" element={<AboutScreen />} />

        <Route path="/follow/:sourceYear" element={<ThisWeekRoute />} />
        <Route path="/follow/:sourceYear/month" element={<FollowMonthListRoute />} />
        <Route path="/follow/:sourceYear/month/:monthToken" element={<FollowMonthOccasionsRoute />} />
        <Route path="/follow/:sourceYear/:occasionId" element={<FollowOccasionRoute />} />
        <Route path="/follow/:sourceYear/:occasionId/recordings" element={<FollowRecordingsRoute />} />
        <Route path="/follow/:sourceYear/:occasionId/category/:section" element={<FollowCategoryRoute />} />
        <Route path="/follow/:sourceYear/:occasionId/pdf/:driveFileId" element={<FollowPdfRoute />} />

        <Route path="/browse/:hebrewYear" element={<YearBrowserRoute />} />
        <Route path="/browse/:hebrewYear/month/:monthToken" element={<MonthOccasionsRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId" element={<BrowseOccasionRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId/recordings" element={<BrowseRecordingsRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId/category/:section" element={<BrowseCategoryRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId/pdf/:driveFileId" element={<BrowsePdfRoute />} />

        <Route path="/this-week-all-years" element={<AllYearsThisWeekScreen />} />
        <Route path="/this-week-all-years/:hebrewYear/:occasionId" element={<ThisWeekAllYearsOccasionRoute />} />
        <Route path="/this-week-all-years/:hebrewYear/:occasionId/recordings" element={<ThisWeekAllYearsRecordingsRoute />} />
        <Route path="/this-week-all-years/:hebrewYear/:occasionId/category/:section" element={<ThisWeekAllYearsCategoryRoute />} />
        <Route path="/this-week-all-years/:hebrewYear/:occasionId/pdf/:driveFileId" element={<ThisWeekAllYearsPdfRoute />} />

        <Route path="/occasion-all-years/:sourceHebrewYear/:sourceOccasionId" element={<OccasionAllYearsRoute />} />
        <Route path="/occasion-all-years/:sourceHebrewYear/:sourceOccasionId/:hebrewYear/:occasionId" element={<OccasionAllYearsOccasionRoute />} />
        <Route
          path="/occasion-all-years/:sourceHebrewYear/:sourceOccasionId/:hebrewYear/:occasionId/recordings"
          element={<OccasionAllYearsRecordingsRoute />}
        />
        <Route
          path="/occasion-all-years/:sourceHebrewYear/:sourceOccasionId/:hebrewYear/:occasionId/category/:section"
          element={<OccasionAllYearsCategoryRoute />}
        />
        <Route
          path="/occasion-all-years/:sourceHebrewYear/:sourceOccasionId/:hebrewYear/:occasionId/pdf/:driveFileId"
          element={<OccasionAllYearsPdfRoute />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <DownloadProvider>
          <PlayerProvider>
            <Analytics />
            <ConnectivityBanner />
            <AppContent />
            {/* One fixed-position container, not two - DownloadProgressBar
                and GlobalPlayerBar each hide themselves independently, so
                this stacks whichever is showing via normal flex flow
                instead of each fixing itself to the viewport edge and
                needing to know the other's height. */}
            <div className="bottom-bars">
              <DownloadProgressBar />
              <GlobalPlayerBar />
            </div>
          </PlayerProvider>
        </DownloadProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
