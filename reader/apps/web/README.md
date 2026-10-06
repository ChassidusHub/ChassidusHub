# @chassidushub-reader/web

An installable, offline-first Progressive Web App for browsing, downloading,
and reading/listening to the Rebbe's Sichos Kodesh and Farbrengens. This is
the primary product - `apps/mobile` covers the same feature slice but isn't
under active development.

The app shell (JS/CSS/catalog data) is precached by its service worker, so
it loads and runs with no network at all after the first visit. Media
fetched through `services/media-proxy` - a PDF read in-app, a recording
played, or anything pulled in by the download feature - is cached the same
way, so it's available offline afterward too.

## Routing

Every screen has a real URL (`react-router-dom`, `App.tsx`): browser
back/forward, reload, and sharing/bookmarking a link all work because
navigation is real routing, not in-memory component state. `vercel.json`
rewrites every path to `index.html` so a hard reload or a fresh visit to a
deep link doesn't 404 against Vercel's static hosting.

`src/routes/useResolvedEntry.ts` re-derives which `CatalogEntry` a URL
points to (`useFollowEntry` re-runs `resolveThisWeek` for the week
containing `:occasionId`; `useBrowseEntry` looks it up directly in
`catalog[:hebrewYear]`), so a URL typed, pasted, or reloaded directly
resolves correctly, not just one reached by clicking through the app.

`BackLink.tsx` is the shared back-navigation control every screen starts
with. `routes/navigationDepth.ts` tracks how many real in-app steps are
available this session (in `sessionStorage`, so it survives a reload); when
that depth is 0 - a fresh load or deep link, with no real history to pop -
`BackLink` navigates to its fixed logical-parent URL with `replace` rather
than `push`, so repeated taps climb the parent chain up to the home screen
instead of leaving history entries that bounce back and forth.

## Screens

- `YearPickerScreen` (`/`) - the home screen: today's Hebrew date and
  parsha, one primary action into the kvius-matched years list, a
  secondary link to browse any year, and the offline note + downloaded-
  content shortcut when offline.
- `KviusYearsScreen` (`/kvius`) - every kvius-matched year, nearest first;
  picking one opens that year's current week.
- `BrowseYearsScreen` (`/years`) - every indexed year, no kvius match
  required.
- `ThisWeekScreen` / `YearBrowserScreen` - list-only screens for a
  kvius-matched or browsed year respectively; `ThisWeekScreen` also shows a
  collapsed "All of {year}" section grouped by Hebrew month.
- `AllYearsThisWeekScreen` (`/this-week-all-years`) - every occasion on one
  of this Hebrew week's dates across every indexed year, kvius-matched or
  not.
- `OccasionScreen` + `OccasionDetail` - the browse flow's occasion page:
  one button per content category the occasion actually has.
- `FarbrengenScreen` - the follow flow's occasion page. A farbrengen's own
  highlighted hanacha (see `isHighlightedFarbrengenHanacha` in
  `@chassidushub-reader/catalog`) and its recordings render inline as the primary
  content; everything else (mugah, maamar, hagahos, hosofos, other PDFs)
  sits in a collapsed "More from this occasion" section. When
  `settings/useAutoplayOnHanacha.ts` is on, opening a highlighted hanacha
  also starts that occasion's recording from chapter 1.
- `RecordingsScreen` - the playlist page for one occasion's recordings.
- `CategoryScreen` - one PDF section's own page.
- `SearchScreen` - smart search by month/parsha/chag/date/year/content
  type, with typo/word-order tolerance via Fuse.js.
- `SettingsScreen` - Appearance, Language, and Playback settings, plus a
  link into `DownloadSettingsScreen` and `AboutScreen`.
- `DownloadSettingsScreen` (`/settings/downloads`) - auto-download,
  content-type, and storage settings; see Downloads below.
- `DownloadedScreen` (`/downloaded`) - everything currently available
  offline, plus in-progress downloads.

## Player

`player/PlayerProvider` (mounted once, above `<Routes>`, in `App.tsx`) owns
the single `<audio>` element and playback state for the whole app, so
playback survives navigating between screens. `usePlayer()` is the hook
screens call to start/control playback. `GlobalPlayerBar` is the
always-visible-once-something-has-played bottom bar: prev/next skip, an
expandable chapter list, and auto-advance into the next chapter.
`PlayerProvider` also wires up the Media Session API
(`navigator.mediaSession`) for real lock-screen/notification-shade
controls.

## PDF viewer

`screens/PdfViewerScreen.tsx` + `pdf/renderPdf.ts` render a PDF's pages
directly in the app via `pdfjs-dist`, rather than handing off to the
browser's own viewer. `loadPdfDocument` streams the URL directly into
`getDocument()` instead of pre-fetching a full `ArrayBuffer`, with
`disableRange: true` since `services/media-proxy`'s `/drive/:fileId` route
doesn't forward Range requests.

Pages render lazily, one canvas per page as it scrolls near the viewport
(via `IntersectionObserver`), and a page's canvas is released back to a
placeholder once scrolled far off-screen. Canvas resolution is capped at
`MAX_DPR = 2` regardless of the device's real `devicePixelRatio`, since a
canvas's memory scales with the square of its DPR and an uncapped render of
every page in a long document can exhaust a mobile tab's memory. Every
render is tagged with a per-page generation number that a release bumps, so
a stale render (superseded by a release before it finished) is discarded
instead of resurrecting a canvas into an already-released wrapper; render
scheduling is also debounced so a page only briefly scrolled past doesn't
start a render at all.

`pdf/pdfPageZoom.ts` implements pinch-to-zoom for the document itself
(native pinch-zoom is disabled only while this screen is mounted, via the
viewport meta tag), applying one shared scale/pan transform to every page's
wrapper together rather than per page, and re-rendering visible pages at a
higher resolution once a pinch gesture ends.

`pdfjs-dist`'s version is pinned (see `renderPdf.ts`) because every current
release depends on `Map.prototype.getOrInsertComputed`, a very recent JS
method not yet available in every real browser - `src/polyfills.ts`
supplies it when missing. Its wasm codecs, `cmaps/`, and `standard_fonts/`
are copied from `node_modules/pdfjs-dist` into `public/` at dev/build time
(`vite.config.ts`'s `copyPdfAssets`), since pdf.js fetches them by hardcoded
filename rather than importing them as modules.

## Downloads

`download/downloadManager.ts` is a pure, React-free orchestrator:
`listDownloadTargets` resolves a set of catalog entries plus content-type
settings into concrete media-proxy URLs; `runDownload` fetches whatever
isn't already cached, with bounded concurrency, into the same Cache Storage
bucket the service worker's own `CacheFirst` route reads from - so a
downloaded file and one opportunistically cached by playback are
indistinguishable, and playback always checks the place a download filled.

`download/DownloadProvider.tsx` (React Context, mounted in `App.tsx`) holds
live per-occasion download state and exposes `downloadOccasion`/
`enqueueBulk`, the primitives every download affordance in the app calls -
a row's own download icon (`OccasionRowIcon`), a bulk "download this
week/month" button, and `useAutoDownloadSync` (mounted once in
`AppContent`), which silently syncs the current auto-download settings'
target content on every app open, the practical equivalent of background
download on platforms with no real background-sync API.

`settings/useDownloadSettings.ts` holds the user's scope (week/month),
source year, kvius-fallback preference, Wi-Fi-only flag, and enabled
content types, all persisted to `localStorage`.

## Connectivity

`network/connectivity.ts` is a plain module-level store (subscribed to via
`useSyncExternalStore` in `useOnlineStatus.ts`) that every offline-aware
part of the app reads from - the home screen's offline note, the top
`ConnectivityBanner`, every download-affordance hook. Going offline is
driven only by a real fetch failure against `services/media-proxy` (a PDF
load, audio playback, or a queued download failing) - never a timer or a
synthetic ping to an unrelated endpoint. Recovery is checked by an active
ping against the Worker itself, but only while currently offline, and only
at real interaction moments: a page navigation, a tap anywhere in the app,
or the app returning to the foreground after being backgrounded
(`useConnectivityRecheckTriggers.ts`).

## Internationalization

`src/i18n/translations.ts` holds the app's UI text in English and Hebrew as
a flat `STRINGS` object per language. `LanguageProvider` (mounted at the
app root) holds the current language in React Context, so every mounted
screen - including `GlobalPlayerBar`, which never unmounts - re-renders
immediately on a change, and flips `<html dir>`/`lang` so Hebrew lays out
right-to-left. `useTranslation()` is the hook every screen calls.

Catalog names follow the UI language too: an occasion is shown through
`occasionTitle(entry, language)` and a recording's chapter through
`chapterTitle` / `audioChapterName` (packages/app-core), which pick the
catalog's own translation (`occasionLabelEn`, `chapterNameHe`) and fall back
to the original. The player's `Playlist` carries both names (`title`, the
Hebrew label it is keyed by, and `titleEn`); `playlistTitle` picks one.

## Service worker & caching

`vite.config.ts` configures `vite-plugin-pwa` in `generateSW` mode:
precaches the app shell and runtime-caches `services/media-proxy` responses
with `CacheFirst` and range-request support. `cacheableResponse.statuses`
allows only `200` - neither `206` (Partial Content, which an `<audio>`
element's first request commonly returns since it sends its own `Range:`
header) nor `0` (an opaque cross-origin response) may be cached as if they
were the complete file, or every later request for that URL would keep
being served back the same partial/unreadable entry regardless of what was
actually requested. Because of this, ordinary `<audio>` playback doesn't
reliably populate the cache on its own; real offline audio comes from the
download feature's own explicit, non-range `fetch()` + `cache.put()`
instead. `expiration.maxEntries` is set well above any realistic download
(a full kvius year's worth of content) so this cache's own LRU pruning
never competes with the Downloads screen's usage readout and "clear
downloads" action as the real storage-management surface.

## Development

```
npm install
npm run dev      # vite dev server
npm run build    # typecheck + production build (dist/), incl. service worker
npm run preview  # serve the production build locally
```

`@chassidushub-reader/kvius-engine` and `@chassidushub-reader/catalog` are resolved via
their built `dist/` output. `npm run build`/`npm run typecheck` build both
first automatically (`prebuild`/`pretypecheck` npm hooks), so `npm install`
+ `npm run build` from a fresh checkout works standalone - this is what
Vercel's deploy runs.

`react`/`react-dom` here are pinned to the exact version `apps/mobile` pins
(React Native requires an exact match), not a caret range. Install new
dependencies here via `npm install <pkg> --workspace=apps/web` from the
repo root, not `cd apps/web && npm install <pkg>` - a caret range that
drifts from the root's hoisted copy leaves this workspace unable to dedupe
against it, installing a second, separate React copy nested inside
`apps/web/node_modules`, which breaks any package (e.g. `lucide-react`)
that reads React context internally.

## Deployment

Deployed to Vercel (root directory `apps/web`, framework preset Vite),
auto-deploying on push via Vercel's GitHub integration.
