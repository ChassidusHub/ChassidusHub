import { useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import { PlayerProvider } from './player/PlayerProvider';
import { DownloadProvider } from './download/DownloadProvider';
import { useAutoDownloadSync } from './download/useAutoDownloadSync';
import { useAutoCatalogUpdate } from './catalog/catalogUpdater';
import { useDownloadRetention } from './download/useDownloadRetention';
import { useConnectivityRecheckTriggers } from './network/useConnectivityRecheckTriggers';
import { adjustNavigationDepth } from './routes/navigationDepth';
import { usePlayer } from './player/usePlayer';
import { LanguageProvider } from './i18n/LanguageProvider';
import { useTranslation } from './i18n/useLanguage';
import { GlobalPlayerBar } from './components/GlobalPlayerBar';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import { DownloadProgressBar } from './components/DownloadProgressBar';
import { AppNav } from './components/AppNav';
import { showsTabs } from './routes/tabs';
import { useActiveDownloads } from './download/useActiveDownloads';
import { HomeScreen } from './screens/HomeScreen';
import { KviusYearsScreen } from './screens/KviusYearsScreen';
import { FarbrengensScreen } from './screens/FarbrengensScreen';
import { MineScreen } from './screens/MineScreen';
import { ThisWeekScreen } from './screens/ThisWeekScreen';
import { YearBrowserScreen } from './screens/YearBrowserScreen';
import { MonthOccasionsScreen } from './screens/MonthOccasionsScreen';
import { FollowMonthListScreen } from './screens/FollowMonthListScreen';
import { FollowMonthOccasionsScreen } from './screens/FollowMonthOccasionsScreen';
import { FarbrengenScreen } from './screens/FarbrengenScreen';
import { AllYearsThisWeekScreen } from './screens/AllYearsThisWeekScreen';
import { OccasionAllYearsScreen } from './screens/OccasionAllYearsScreen';
import { PdfViewerScreen } from './screens/PdfViewerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DownloadSettingsScreen } from './screens/DownloadSettingsScreen';
import { DownloadedScreen } from './screens/DownloadedScreen';
import { AboutScreen } from './screens/AboutScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { SearchScreen } from './screens/SearchScreen';
import { useFarbrengenEntry } from './routes/useResolvedEntry';
import { canonicalFarbrengenPath } from './routes/links';
import { CollectionRoutes, LegacyLibraryRoute, LibraryRoutes, OccasionGroupRoute } from './routes/LibraryRoutes';
import { SeforimRoutes } from './routes/SeforimRoutes';

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

function FarbrengenRoute() {
  return <FarbrengenScreen resolved={useFarbrengenEntry()} />;
}

function OccasionAllYearsRoute() {
  const { sourceHebrewYear, sourceOccasionId } = useParams<{ sourceHebrewYear: string; sourceOccasionId: string }>();
  return <OccasionAllYearsScreen sourceHebrewYear={Number(sourceHebrewYear)} sourceOccasionId={Number(sourceOccasionId)} />;
}

/** `resolved` can be null (a stale/bad URL) - PdfViewerScreen needs a real entry, so fall back to "not found" rather than passing null through. */
function NotFound() {
  const { t } = useTranslation();
  return <p className="gap-message">{t.pageNotFound}</p>;
}

function FarbrengenPdfRoute() {
  const resolved = useFarbrengenEntry();
  const { driveFileId } = useParams<{ driveFileId: string }>();
  return resolved ? <PdfViewerScreen key={driveFileId} resolved={resolved} /> : <NotFound />;
}

/** An address a farbrengen was shared under before (routes/links.ts): its page, its recordings or texts section, or its PDF, at the one address it has now. */
function LegacyFarbrengenRoute() {
  const { pathname } = useLocation();
  return <Navigate to={canonicalFarbrengenPath(pathname) ?? '/'} replace />;
}

function Home() {
  return <HomeScreen targetYear={currentHebrewYear()} />;
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
  useAutoCatalogUpdate();
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
        <Route path="/farbrengens" element={<FarbrengensScreen />} />
        <Route path="/years" element={<Navigate to="/farbrengens" replace />} />
        <Route path="/me" element={<MineScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/settings/downloads" element={<DownloadSettingsScreen />} />
        <Route path="/downloaded" element={<DownloadedScreen />} />
        <Route path="/about" element={<AboutScreen />} />
        <Route path="/privacy" element={<PrivacyScreen />} />
        <Route path="/farbrengens/moed/:slug" element={<OccasionGroupRoute axis="moadim" />} />
        <Route path="/farbrengens/parsha/:slug" element={<OccasionGroupRoute axis="parshiyos" />} />
        <Route path="/library/*" element={<LibraryRoutes />} />
        <Route path="/l/*" element={<CollectionRoutes />} />
        <Route path="/s/*" element={<SeforimRoutes />} />
        {/* The seforim's addresses before the one shelf (routes/links.ts's canonicalLibraryPath). */}
        <Route path="/seforim/*" element={<LegacyLibraryRoute />} />

        <Route path="/f/:hebrewYear/:occasionId" element={<FarbrengenRoute />} />
        <Route path="/f/:hebrewYear/:occasionId/pdf/:driveFileId" element={<FarbrengenPdfRoute />} />

        <Route path="/follow/:sourceYear" element={<ThisWeekRoute />} />
        <Route path="/follow/:sourceYear/month" element={<FollowMonthListRoute />} />
        <Route path="/follow/:sourceYear/month/:monthToken" element={<FollowMonthOccasionsRoute />} />
        <Route path="/browse/:hebrewYear" element={<YearBrowserRoute />} />
        <Route path="/browse/:hebrewYear/month/:monthToken" element={<MonthOccasionsRoute />} />
        <Route path="/this-week-all-years" element={<AllYearsThisWeekScreen />} />
        <Route path="/occasion-all-years/:sourceHebrewYear/:sourceOccasionId" element={<OccasionAllYearsRoute />} />

        {/* Every address a farbrengen had before /f/ (routes/links.ts). */}
        <Route path="/follow/:sourceYear/:occasionId/*" element={<LegacyFarbrengenRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId/*" element={<LegacyFarbrengenRoute />} />
        <Route path="/this-week-all-years/:hebrewYear/:occasionId/*" element={<LegacyFarbrengenRoute />} />
        <Route path="/occasion-all-years/:sourceHebrewYear/:sourceOccasionId/:hebrewYear/:occasionId/*" element={<LegacyFarbrengenRoute />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

/**
 * The frame around every page: the connectivity strip, the page, and the
 * bars fixed to the bottom - the tabs among them (on a wide window they
 * stand down the side instead; `.app-shell-tabs` makes room for them).
 * A PDF and the seforim reader take the whole screen, without the tabs.
 */
function Shell() {
  const { pathname } = useLocation();
  const tabs = showsTabs(pathname);
  return (
    <div className={tabs ? 'app-shell app-shell-tabs' : 'app-shell'}>
      <ConnectivityBanner />
      <AppContent />
      {/* One fixed-position container, not three - DownloadProgressBar
          and GlobalPlayerBar each hide themselves independently, so this
          stacks whichever is showing via normal flex flow, above the tabs,
          instead of each fixing itself to the viewport edge and needing to
          know the others' heights. */}
      <div className="bottom-bars">
        <DownloadProgressBar />
        <GlobalPlayerBar />
        {tabs && <AppNav />}
      </div>
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
            <Shell />
          </PlayerProvider>
        </DownloadProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
