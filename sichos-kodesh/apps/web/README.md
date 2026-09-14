# @sichos-kodesh/web

A real, installable, offline-first Progressive Web App version of the
Sichos Kodesh MVP — same feature slice as `apps/mobile` (pick a
kvius-matched source year, see this week's matched occasions - Shabbos and
weekdays alike, download the audio/PDF, play/read fully offline), built for
testing on any device with a browser rather than requiring a sideloaded
APK.

This isn't a token "installable" gesture: the app shell (JS/CSS/catalog
data) is precached by its service worker so it loads and runs with no
network at all after the first visit, and once a PDF has been fetched
through `services/media-proxy` it's runtime-cached with a `CacheFirst`
strategy plus Workbox's range-request support for fast re-opens. Audio
isn't meaningfully cached this way in practice (see `vite.config.ts`'s
comment for the real bug that forced that tradeoff) - real offline audio,
matching what `apps/mobile` gets from a downloaded local file, is still an
open item here.

## Structure

### Routing (`react-router-dom`, `App.tsx`)

Every screen has a real URL (`/follow/:sourceYear`, `/browse/:hebrewYear`,
`/browse/:hebrewYear/:occasionId`, `.../recordings`, `.../category/:section`,
`.../pdf/:driveFileId`, `/settings`) instead of the earlier version's
in-memory `useState<View>` switch - browser back/forward, reload, and
sharing/bookmarking a link all work because navigation is real routing, not
just internal component state. `vercel.json` rewrites every path to
`index.html` so a hard reload or a fresh visit to a deep link doesn't 404
against Vercel's static hosting.

`src/routes/useResolvedEntry.ts` re-derives which `CatalogEntry` a URL
points to (`useFollowEntry` re-runs `resolveThisWeek` for the week
containing `:occasionId`; `useBrowseEntry` looks it up directly in
`catalog[:hebrewYear]`) rather than passing it down through component
state - correct even for a URL typed/pasted/reloaded directly, not just one
reached by clicking through the app.

- `src/screens/YearPickerScreen.tsx` — the home screen: today's date and
  parsha up front (`@sichos-kodesh/catalog`'s `currentParsha`, built on
  `@hebcal/core`'s `Sedra` so it correctly rolls a weekday forward to its
  Shabbos, handles doubled/displaced parshios, and returns `null` on a
  chag), then one prominent action - **This week's farbrengens** - straight
  into the nearest kvius-matched year's current week
  (`findMatchingYears(targetYear)[0]`, "sorted nearest-first" per its own
  doc comment) rather than a list of candidate years to pick from first.
  Below that, two secondary tabs: **Other kvius years** (every other
  kvius-matched candidate, for picking a different one on purpose) and
  **Browse any year** (`browsableYears` via `@sichos-kodesh/catalog`, every
  indexed year from 5710 onward, no kvius match required - this app is
  scoped to the current Rebbe's own sichos, not the Previous Rebbe's
  pre-Nesius farbrengens; unrelated to reshimos exclusion, which is a
  separate link-level filter).
- `src/screens/ThisWeekScreen.tsx` / `YearBrowserScreen.tsx` — list-only
  screens (no embedded detail/PDF state anymore): `ThisWeekScreen` calls
  `resolveThisWeek` (from `@sichos-kodesh/catalog`, shared with
  `apps/mobile`) for every occasion with real content anywhere in the
  current Hebrew week against a kvius-matched source year, showing a music
  icon on any row that actually has a recording; `YearBrowserScreen`
  lists every occasion a browsed year actually has, grouped by Hebrew month
  (`mafteiachMonthName`) - no kvius engine involved (a browsed year has no
  guaranteed week/date alignment with the current Hebrew year). Each row
  links to `/follow/.../:occasionId` or `/browse/.../:occasionId`.
- `src/screens/OccasionScreen.tsx` + `src/components/OccasionDetail.tsx` —
  the **/browse** flow's occasion page: one **button per category** it
  actually has (Recordings, then each PDF section present with a count),
  every section treated as an equal-weight category - appropriate for
  browsing history freely, not scoped to any one farbrengen's own primary
  content.
- `src/screens/FarbrengenScreen.tsx` — the **/follow** flow's own occasion
  page, deliberately *not* the generic `OccasionScreen`: a farbrengen's own
  Toras Menachem or Sichos Kodesh **biltiMugah** hanacha (the as-heard,
  unedited transcript - see `@sichos-kodesh/catalog`'s
  `isHighlightedFarbrengenHanacha`) *is* the farbrengen, so it - and
  Recordings, when there are any - render inline and first, as the
  highlighted content. Mugah (the later Rebbe-edited text), the maamar,
  hagahos, hosofos, and any biltiMugah PDF citing something else entirely
  (a real but minority case - letters, memorial booklets) are real and
  worth keeping reachable, but they're a different kind of thing, not
  "more of the same" - they're demoted into a collapsed
  `<details>`/`<summary>` **"More from this occasion"** section at the
  bottom instead of being listed as equal buttons alongside the sichos.
- `src/screens/RecordingsScreen.tsx` — the dedicated playlist page for one
  occasion's recordings (a farbrengen is usually several separate
  recordings, not one - real examples run to 8-10: a few sichos, a maamar,
  niggunim between them, see `packages/mafteiach-index`'s `jemAudio.ts`),
  Spotify-album-style: each chapter's real name and duration, tap to play.
- `src/screens/CategoryScreen.tsx` — one PDF section's own page (reached
  from its OccasionDetail button), sorted so a PDF matching the user's
  edition preference - see SettingsScreen below - comes first.
- `src/player/` — `PlayerProvider` (mounted once, above `<Routes>`, in
  `App.tsx`) holds the single `<audio>` element and playback state for the
  *whole app*, not per-screen - the previous version's player lived inside
  `PdfViewerScreen` and was unmounted (stopping playback) on navigating
  away from it. `usePlayer()` (`usePlayer.ts`) is the hook screens call to
  start/control playback; `GlobalPlayerBar` (`src/components/`) is the
  always-visible-once-something-has-played bottom bar, rendered once at
  the app root alongside `<Routes>` so it survives every navigation -
  prev/next skip, an expandable chapter list, and auto-advance into the
  next chapter when one ends, matching Spotify/YouTube. `PlayerProvider`
  also wires up the Media Session API (`navigator.mediaSession`) - real
  title/chapter, artwork, and working prev/next/play/pause/seek on
  Android's lock-screen and notification-shade media controls (and the
  macOS/Windows/iOS equivalents), not just a bare "playing audio from
  <site>" entry with no controls. `App.tsx`'s `AppContent` wrapper adds a
  `.has-player` class to the routed content whenever `GlobalPlayerBar` can
  show (i.e. once anything has played this session) - the bar is
  `position: fixed` and can appear over *any* screen now, so without this,
  its bottom edge would cover, and block clicks on, the last bit of
  content on every screen (a real reported bug); the padding is centralized
  here rather than duplicated per-screen.
- `src/screens/PdfViewerScreen.tsx` + `src/pdf/renderPdf.ts` — renders a
  PDF's pages directly in the app via `pdfjs-dist` instead of handing off
  to the browser's own viewer or a new tab. `renderPdf.ts`'s
  `loadPdfDocument` takes the media-proxy PDF URL directly
  (`pdfjs-dist`'s own `getDocument({ url, disableRange: true, onProgress })`)
  rather than pre-fetching the whole file into an `ArrayBuffer` first, so
  pdf.js starts parsing as bytes stream in instead of waiting on a full
  download - `disableRange: true` because `services/media-proxy`'s
  `/drive/:fileId` route doesn't actually forward Range requests (Drive's
  confirm-token/cookie flow for larger files makes real byte-range
  streaming there meaningfully harder), so claiming range support to
  pdf.js would just make it probe with requests the Worker can't honor.
  Pages then render **lazily**, one canvas per page as it scrolls near the
  viewport (via `IntersectionObserver`), not all of them upfront - and a
  page's canvas is released back to a same-sized placeholder once it's
  scrolled far off-screen, re-rendering on demand if scrolled back. Canvas
  resolution is capped at `MAX_DPR = 2` even on higher-`devicePixelRatio`
  screens. Together, these are what stop a real multi-page document from
  crashing the tab outright ("Aw, Snap!") on a phone - a canvas's memory
  scales with the *square* of its DPR, so rendering every page of a long
  document unconditionally at an uncapped (sometimes 3+) DPR could add
  hundreds of MB to a mobile tab; this was reproduced and fixed, not
  assumed.
- `src/pdf/pdfPageZoom.ts` — lets a user pinch-zoom a single page in place,
  instead of the browser's native pinch gesture zooming the whole visual
  viewport (header, back link, everything) - a real reported problem.
  `PdfViewerScreen` disables native pinch-zoom (setting the page's
  `<meta name="viewport">` to `user-scalable=no`) only while it's mounted,
  restoring the original content on unmount, so every other screen keeps
  normal pinch-to-zoom for accessibility. Zoom is per-page and exclusive -
  only one page is ever enlarged at a time, matching how a document is
  actually read (zoom in on one page's fine print, not the whole scroll).
  Ending a pinch re-renders that page's canvas at up to `MAX_BOOST_MULTIPLIER`
  its fit-width resolution (real sharpness instead of a stretched-out fit-
  width bitmap - the "focused page loads a higher quality" ask); losing
  focus - a different page gets pinched instead, this one's pinched back
  down to 1x, or it scrolls far enough off-screen to be released by
  `renderPdf.ts`'s own `IntersectionObserver` anyway - drops it straight
  back to the standard fit-width render rather than keeping the boosted
  canvas resident ("and delete if continued"). A one-finger drag on an
  already-zoomed page only pans sideways once it's clearly more horizontal
  than vertical; a vertical or diagonal drag is left completely alone (no
  `preventDefault`, no style change) so scrolling down through the
  document keeps working exactly as it does before anything is zoomed -
  the "smart scroll" ask. `.pdf-page`'s `touch-action: pan-y` (index.css)
  is what makes that reliable instead of racy: the browser is told upfront
  to only ever natively handle *vertical* touch movement on the element,
  so it never claims a horizontal drag as its own scroll gesture before
  the JS here gets a chance to decide what it is. Verified against the
  gesture logic in isolation (synthetic multi-pointer `PointerEvent`
  sequences dispatched at a standalone harness, not a real touchscreen):
  a pinch grows a page's own box (not the page/app around it), a vertical
  drag never touches its transform, a horizontal drag does, starting a
  pinch on a second page releases the first, and an off-screen reset never
  fires a redundant re-render.
- `apps/web`'s `pdfjs-dist` version is pinned deliberately (see
  `renderPdf.ts`'s comment) - below it is a real high-severity
  vulnerability, and every current version (patched or not) depends on
  `Map.prototype.getOrInsertComputed`, a very recently standardized JS
  method plenty of real browsers still don't have - `src/polyfills.ts`
  supplies it when missing (confirmed as a real, reproducible cause of
  "download but just show blank pages", not just a test-tooling gap). Its
  wasm-backed image codecs (JBig2/JPEG2000 - used by this dataset's
  scanned hagahos images), `cmaps/`, and `standard_fonts/` are copied from
  `node_modules/pdfjs-dist` into `public/` at dev/build time
  (`vite.config.ts`'s `copyPdfAssets`) since pdf.js fetches them by a
  hardcoded filename rather than a normal JS import - without this, PDFs
  with those embedded images silently render with the image missing.
- `src/screens/SettingsScreen.tsx` — lets the user prefer one hanacha
  (Sichos Kodesh, Sefer HaSichos/HaMaamarim, or Toras Menachem - three
  real, distinct transcript series, persisted via `localStorage`) for
  occasions whose PDFs cite more than one (see `packages/catalog`'s
  `classifyPdfEdition`/`sortPdfsByEditionPreference`).
- Icons are `lucide-react` throughout (`BackLink.tsx`'s shared back-chevron
  link, `GlobalPlayerBar`/`RecordingsScreen`'s play/pause/skip,
  `YearPickerScreen`'s settings gear, `SettingsScreen`'s checkmark) - one
  consistent icon set, not ad hoc emoji characters standing in for icons.
- `src/catalog/data/` — the same per-year static JSON bundled into
  `apps/mobile`, generated by `packages/catalog`'s `bin/build.ts`.
- `src/download/download.ts` — builds `services/media-proxy` URLs
  (`audioUrl`, `pdfUrl`; see `src/config.ts` for the base URL) for the
  `<audio>` element and `loadPdfDocument` to fetch directly, rather than
  this app pre-fetching the bytes itself - both audio and PDF now stream
  through their consumer instead of blocking on a full download first.
- `vite.config.ts` — `vite-plugin-pwa` in `generateSW` mode: precaches the
  app shell, and runtime-caches media-proxy responses (`CacheFirst`,
  `rangeRequests: true`) so a downloaded PDF survives offline and supports
  fast re-opens. `cacheableResponse.statuses` deliberately excludes `206`
  (Partial Content) - a real, reproduced bug, not a theoretical one: an
  `<audio>` element's very first request for a fresh URL commonly carries
  its own `Range:` header (it doesn't wait for a full download before
  starting playback), so with `206` allowed, whatever small slice the
  Worker returned for *that* request got cached as if it were the entire
  file. Every later request for a different byte range then hit
  `workbox-range-requests`' own documented behavior of returning an
  already-206 cached response verbatim regardless of what range was
  actually asked for - so the same first sliver of the file kept coming
  back forever: a track's duration (readable from that sliver alone)
  would show, but the audio itself never actually loaded. The tradeoff:
  since real audio playback keeps making Range requests throughout, an
  audio file effectively no longer gets cached by the service worker at
  all in practice (every request now correctly falls through live to the
  Worker instead of ever risking a poisoned cache) - real offline
  audio needs its own proper download step, not this cache, and is
  tracked separately as a still-open feature. PDF requests are unaffected
  (`loadPdfDocument` sets `disableRange: true`, so they're never a Range
  request that could hit this path either way).

## Development

```
npm install
npm run dev      # vite dev server
npm run build    # typecheck + production build (dist/), incl. service worker
npm run preview  # serve the production build locally
```

`@sichos-kodesh/kvius-engine` and `@sichos-kodesh/catalog` are resolved via
their built `dist/` output, not source, same as any consumer of those
packages. `npm run build`/`npm run typecheck` here build both first
automatically (`prebuild`/`pretypecheck` npm hooks), so `npm install` +
`npm run build` from a completely fresh checkout works standalone — this
is what Vercel's deploy actually runs.

`react`/`react-dom` here are pinned to the *exact* version `apps/mobile`
pins them to (React Native requires an exact match), not a caret range -
a real, previously-hit trap: a caret range here that drifted even one
patch version past the root's hoisted copy left this workspace unable to
dedupe against it, so npm installed a second, separate React copy nested
inside `apps/web/node_modules`. Two React copies in the same page breaks
any package that reads React context internally (confirmed: `lucide-react`
icons crashed the whole app with "Cannot read properties of null (reading
'useContext')" the moment one rendered) - always install new dependencies
here via `npm install <pkg> --workspace=apps/web` from the repo root (not
`cd apps/web && npm install <pkg>`) and verify afterward with
`find apps/web -path '*/node_modules/react/package.json'` printing nothing
(a hit means a duplicate crept back in).

## Deployment

Deployed to Vercel (root directory `apps/web`, framework preset Vite) —
auto-deploys on push via Vercel's GitHub integration.
