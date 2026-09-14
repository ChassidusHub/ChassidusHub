import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import { PlayerProvider } from './player/PlayerProvider';
import { usePlayer } from './player/usePlayer';
import { GlobalPlayerBar } from './components/GlobalPlayerBar';
import { YearPickerScreen } from './screens/YearPickerScreen';
import { ThisWeekScreen } from './screens/ThisWeekScreen';
import { YearBrowserScreen } from './screens/YearBrowserScreen';
import { OccasionScreen } from './screens/OccasionScreen';
import { FarbrengenScreen } from './screens/FarbrengenScreen';
import { RecordingsScreen } from './screens/RecordingsScreen';
import { CategoryScreen } from './screens/CategoryScreen';
import { PdfViewerScreen } from './screens/PdfViewerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useFollowEntry, useBrowseEntry } from './routes/useResolvedEntry';

function ThisWeekRoute() {
  const { sourceYear } = useParams<{ sourceYear: string }>();
  return <ThisWeekScreen sourceYear={Number(sourceYear)} />;
}

function YearBrowserRoute() {
  const { hebrewYear } = useParams<{ hebrewYear: string }>();
  return <YearBrowserScreen hebrewYear={Number(hebrewYear)} />;
}

function FollowOccasionRoute() {
  return <FarbrengenScreen resolved={useFollowEntry()} />;
}

function BrowseOccasionRoute() {
  return <OccasionScreen resolved={useBrowseEntry()} />;
}

/** `resolved` can be null (a stale/bad URL) - RecordingsScreen/CategoryScreen/PdfViewerScreen all need a real entry, so fall back to "not found" rather than passing null through. */
function NotFound() {
  return <p className="gap-message">This page couldn't be found - the link may be out of date.</p>;
}

function FollowRecordingsRoute() {
  const resolved = useFollowEntry();
  return resolved ? <RecordingsScreen resolved={resolved} /> : <NotFound />;
}
function BrowseRecordingsRoute() {
  const resolved = useBrowseEntry();
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

function Home() {
  return <YearPickerScreen targetYear={currentHebrewYear()} />;
}

/**
 * Wraps every route's content so it always leaves room for GlobalPlayerBar
 * when something's playing - the bar is `position: fixed` and can show on
 * *any* screen now (it's global, not scoped to PdfViewerScreen anymore),
 * so without this, its bottom edge covers - and blocks clicks on - the
 * last bit of content on every other screen (a real reported bug: "hides
 * content and can't click it"). Scrolling to the actual end of a page's
 * content should land just above the bar, not have the bar sit over it.
 */
function AppContent() {
  const player = usePlayer();
  return (
    <div className={player.playlist ? 'app-content has-player' : 'app-content'}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<SettingsScreen />} />

        <Route path="/follow/:sourceYear" element={<ThisWeekRoute />} />
        <Route path="/follow/:sourceYear/:occasionId" element={<FollowOccasionRoute />} />
        <Route path="/follow/:sourceYear/:occasionId/recordings" element={<FollowRecordingsRoute />} />
        <Route path="/follow/:sourceYear/:occasionId/category/:section" element={<FollowCategoryRoute />} />
        <Route path="/follow/:sourceYear/:occasionId/pdf/:driveFileId" element={<FollowPdfRoute />} />

        <Route path="/browse/:hebrewYear" element={<YearBrowserRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId" element={<BrowseOccasionRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId/recordings" element={<BrowseRecordingsRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId/category/:section" element={<BrowseCategoryRoute />} />
        <Route path="/browse/:hebrewYear/:occasionId/pdf/:driveFileId" element={<BrowsePdfRoute />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <PlayerProvider>
        <AppContent />
        <GlobalPlayerBar />
      </PlayerProvider>
    </BrowserRouter>
  );
}

export default App;
