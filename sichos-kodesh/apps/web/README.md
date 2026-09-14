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

- `src/screens/YearPickerScreen.tsx` — the home screen, kept deliberately
  light: today's real Hebrew date (`@sichos-kodesh/catalog`'s
  `todayHebrewDateLabel`, `@hebcal/core`'s `HDate.renderGematriya` - e.g.
  "ו' תשרי תשפ״ז", not a translated Gregorian one, since this app is
  Hebrew-calendar-first) and parsha (`currentParsha`, built on `Sedra` so
  it correctly rolls a weekday forward to its Shabbos, handles
  doubled/displaced parshios, and returns `null` on a chag), one prominent
  action - **Week's Kvius Farbrengens** - into `/kvius`, and a secondary
  "Browse any year" link into `/years`. No tabs or inline year lists on
  this screen itself anymore - each destination is its own screen now.
- `src/screens/KviusYearsScreen.tsx` (`/kvius`) — every kvius-matched year
  (`findMatchingYears(targetYear)`, "sorted nearest-first" per its own doc
  comment), nearest first; picking one goes to that year's current week.
  `src/screens/BrowseYearsScreen.tsx` (`/years`) — every indexed year from
  5710 onward (`browsableYears`), no kvius match required - this app is
  scoped to the current Rebbe's own sichos, not the Previous Rebbe's
  pre-Nesius farbrengens; unrelated to reshimos exclusion, a separate
  link-level filter.
- `src/screens/ThisWeekScreen.tsx` / `YearBrowserScreen.tsx` — list-only
  screens (no embedded detail/PDF state anymore): `ThisWeekScreen` calls
  `resolveThisWeek` (from `@sichos-kodesh/catalog`, shared with
  `apps/mobile`) for every occasion with real content anywhere in the
  current Hebrew week against a kvius-matched source year, showing a music
  icon on any row that actually has a recording, then - since the year is
  kvius-matched, its other weeks are worth reaching too, not just this
  one - a collapsed **"All of {year}"** section below it, grouped by
  Hebrew month (`src/utils/groupByMonth.ts`, shared with
  `YearBrowserScreen`) the same way a browsed year is; `YearBrowserScreen`
  lists every occasion a browsed year actually has the same way - no kvius
  engine involved there (a browsed year has no guaranteed week/date
  alignment with the current Hebrew year). Each row links to
  `/follow/.../:occasionId` or `/browse/.../:occasionId`.
- `src/screens/AllYearsThisWeekScreen.tsx` (`/this-week-all-years`,
  reached from a farbrengen's own page) — every occasion indexed on one of
  this Hebrew week's *dates*, across **every** year in the catalog, kvius-
  matched or not (`@sichos-kodesh/catalog`'s `resolveThisWeekAllYears`,
  grouped by year, most recent first) - "what happened on these dates
  across all our history," not "what happened this same week in a
  weekday-aligned year." Picking one goes to its own farbrengen page
  (`useThisWeekAllYearsEntry` in `routes/useResolvedEntry.ts` - a plain
  year/occasionId lookup, like `useBrowseEntry`, just with its own
  back-path), rendered through the same highlighted-hanacha
  `FarbrengenScreen` as everywhere else in the follow flow, not a generic
  one.
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
  When `settings/useAutoplayOnHanacha.ts`'s setting is on, tapping "Read"
  on a highlighted hanacha also starts that occasion's recording (from
  chapter 1), overriding whatever was already playing - a deliberate
  override, not a conditional one, since reading and hearing the hanacha
  are meant to happen together when this is on; off by default. A link at
  the bottom into `/this-week-all-years` (see `AllYearsThisWeekScreen`
  above) surfaces every other year with something on these same Hebrew
  dates, not just this kvius-matched one.
- `src/screens/RecordingsScreen.tsx` — the dedicated playlist page for one
  occasion's recordings (a farbrengen is usually several separate
  recordings, not one - real examples run to 8-10: a few sichos, a maamar,
  niggunim between them, see `packages/mafteiach-index`'s `jemAudio.ts`),
  Spotify-album-style: each chapter's real name and duration, tap to play.
- `src/screens/CategoryScreen.tsx` — one PDF section's own page (reached
  from its OccasionDetail button), listing that section's PDFs.
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
  assumed. Scrolling fast enough up and down can still crash a tab a
  different way: it fires many `IntersectionObserver` callbacks in quick
  succession, wanting to render a page that a later callback, milliseconds
  on, wants released again before the first render (an async
  `doc.getPage()` + `page.render()` call) even finished - a real
  reproduced case, not a theoretical one. `renderPdf.ts` tags every render
  with a per-page generation number that `release` bumps, so a render only
  ever commits its canvas if its generation is still current for that page
  (a stale one just gets discarded instead of resurrecting a canvas into a
  wrapper that was supposed to be released); rendering itself is also
  debounced (`RENDER_DEBOUNCE_MS`) so a page only fleetingly scrolled past
  during a fast scroll is usually released again before its render was
  ever even scheduled, rather than every fleeting pass starting its own
  render. Verified with fake pdf.js-shaped page objects (a controllable
  render delay standing in for a real, slower render) driven through a
  genuine rapid up/down `window.scrollTo` storm in a real browser: the fix
  cut render attempts by over 15x and peak simultaneously-alive canvases
  during the storm, compared to the same storm against the pre-fix code.
- `src/pdf/pdfPageZoom.ts` — lets a user pinch-zoom the whole document in
  place, instead of the browser's native pinch gesture zooming the whole
  visual viewport (header, back link, everything) - a real reported
  problem. `PdfViewerScreen` disables native pinch-zoom (setting the
  page's `<meta name="viewport">` to `user-scalable=no`) only while it's
  mounted, restoring the original content on unmount, so every other
  screen keeps normal pinch-to-zoom for accessibility. One shared
  scale/pan state applies to every page's wrapper together, on every
  frame of the gesture (`attachPdfZoom`'s pointer listeners live on the
  whole `.pdf-pages` container, not per page) - an earlier per-page-only
  version zoomed just the page under your fingers, so scrolling while
  zoomed in would snap back to a different, unzoomed page the moment it
  scrolled into view; zooming the whole document together is what an
  actual PDF reader does. Ending a pinch re-renders every
  currently-rendered page's canvas at up to `MAX_BOOST_MULTIPLIER` its
  fit-width resolution, together (real sharpness instead of a
  stretched-out fit-width bitmap); pinching back down to 1x drops them
  all back to the standard fit-width render the same way, rather than
  keeping the boosted canvases resident. A one-finger drag while zoomed
  only pans sideways once it's clearly more horizontal than vertical; a
  vertical or diagonal drag is left completely alone (no `preventDefault`,
  no style change) so scrolling down through the document keeps working
  exactly as it does before anything is zoomed - the "smart scroll" ask.
  `.pdf-page`'s `touch-action: pan-y` (index.css) is what makes that
  reliable instead of racy: the browser is told upfront to only ever
  natively handle *vertical* touch movement on the element, so it never
  claims a horizontal drag as its own scroll gesture before the JS here
  gets a chance to decide what it is. Verified against the gesture logic
  in isolation (synthetic multi-pointer `PointerEvent` sequences
  dispatched at a standalone harness, not a real touchscreen): a pinch
  grows *every* page's box together (not just the touched one, and not
  the page/app around them), a vertical drag never touches the shared
  transform, a horizontal drag does, and pinching back to 1x resets every
  page.
  `PdfViewerScreen`'s `.zoomed` class (toggled via `renderPdfPages`'s
  `onZoomChange` callback) drops the screen's width cap and side padding
  while zoomed, so panning around a zoomed page has the full screen to
  work with instead of being clipped to the normal reading-width column;
  at rest, the page sits back in that same comfortable column with a bit
  of space on each side, same as every other screen.
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
- `src/screens/SettingsScreen.tsx` — three independent sections, each its
  own `localStorage`-backed setting: **Appearance** (`settings/useTheme.ts`
  - Dark/Light/System; `System`, the default, just follows
  `prefers-color-scheme`), **Language** (`i18n/` - English/Hebrew, see
  below), and **Playback** (`settings/useAutoplayOnHanacha.ts` - see
  FarbrengenScreen above). A link into `/about` (`AboutScreen.tsx`)
  credits the two real, independent sources this whole app runs on:
  mafteiach.app for every occasion/date/PDF citation, JEM for every
  recording (see `packages/mafteiach-index`/`packages/jem-index`'s own
  READMEs). The previous PDF-edition-preference setting (prefer Sichos
  Kodesh/Sefer/Toras Menachem when a section had PDFs citing more than
  one) is gone - it only ever affected sort order within a category page,
  and `FarbrengenScreen` (the flow people actually use) already surfaces
  the right hanacha directly via `isHighlightedFarbrengenHanacha`
  regardless of any preference, so the setting had nothing left to do.
  `classifyPdfEdition`/`sortPdfsByEditionPreference` themselves stay in
  `packages/catalog` - `apps/mobile` still has its own equivalent setting.
- `src/i18n/` — the whole app's UI text in English and Hebrew
  (`translations.ts`'s `STRINGS`, a flat object per language - parametrized
  strings like `t.yearsAgo(3)` are plain functions, not a template-string
  mini-language). `LanguageProvider` (mounted once at the app root, next to
  `PlayerProvider`) holds the current language in React Context - not just
  `localStorage` read fresh per component like `settings/`'s other
  hooks - specifically so every already-mounted screen re-renders
  immediately on a change, including `GlobalPlayerBar`, which never
  unmounts across navigation; it also flips `<html dir>`/`lang` so Hebrew
  actually lays out right-to-left instead of just displaying Hebrew
  characters left-to-right in an LTR page. `useTranslation()` is the hook
  every screen calls (`const { t } = useTranslation()`, then `t.recordings`
  etc.) - `packages/catalog`'s own bundled data (occasion labels, Hebrew
  dates, PDF labels) is unaffected either way, since that's real content,
  not UI chrome, and was already in Hebrew.
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
