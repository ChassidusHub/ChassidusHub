# @sichos-kodesh/web

A real, installable, offline-first Progressive Web App version of the
Sichos Kodesh MVP — same feature slice as `apps/mobile` (pick a
kvius-matched source year, see this week's matched occasions - Shabbos and
weekdays alike, download the audio/PDF, play/read fully offline), built for
testing on any device with a browser rather than requiring a sideloaded
APK.

This isn't a token "installable" gesture: the app shell (JS/CSS/catalog
data) is precached by its service worker so it loads and runs with no
network at all after the first visit, and once a recording/PDF has been
fetched through `services/media-proxy` it's runtime-cached with a
`CacheFirst` strategy plus Workbox's range-request support — so seeking
within an already-downloaded audio file works offline too, matching what
`apps/mobile` gets from a real local file.

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

- `src/screens/YearPickerScreen.tsx` — two tabs: **Follow along**
  (`findMatchingYears` via `@sichos-kodesh/kvius-engine`, kvius-matched
  candidates only) and **Browse any year** (`browsableYears` via
  `@sichos-kodesh/catalog`, every indexed year from 5710 onward, no kvius
  match required - this app is scoped to the current Rebbe's own sichos,
  not the Previous Rebbe's pre-Nesius farbrengens; unrelated to reshimos
  exclusion, which is a separate link-level filter).
- `src/screens/ThisWeekScreen.tsx` / `YearBrowserScreen.tsx` — list-only
  screens (no embedded detail/PDF state anymore): `ThisWeekScreen` calls
  `resolveThisWeek` (from `@sichos-kodesh/catalog`, shared with
  `apps/mobile`) for every occasion with real content anywhere in the
  current Hebrew week against a kvius-matched source year; `YearBrowserScreen`
  lists every occasion a browsed year actually has, grouped by Hebrew month
  (`mafteiachMonthName`) - no kvius engine involved (a browsed year has no
  guaranteed week/date alignment with the current Hebrew year). Each row
  links to `/follow/.../:occasionId` or `/browse/.../:occasionId`.
- `src/screens/OccasionScreen.tsx` + `src/components/OccasionDetail.tsx` —
  an occasion's own landing page shows one **button per category** it
  actually has (Recordings, then each PDF section present with a count) -
  not every recording and every PDF listed inline on one page, which used
  to mean a very long page mixing hanachos with mugah/hagahos/etc. all
  together. Each button navigates to its own page.
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
  next chapter when one ends, matching Spotify/YouTube.
- `src/screens/PdfViewerScreen.tsx` — renders a PDF's pages directly in the
  app via `pdfjs-dist` (canvas-per-page, scaled to fit, at `devicePixelRatio`
  resolution so pages read sharp on high-DPI screens - a real, previously
  reported "loads but in low quality" bug) instead of handing off to the
  browser's own viewer or a new tab. `apps/web`'s `pdfjs-dist` version is
  pinned deliberately (see `src/pdf/renderPdf.ts`'s comment) - below it is
  a real high-severity vulnerability, and every current version (patched or
  not) depends on `Map.prototype.getOrInsertComputed`, a very recently
  standardized JS method plenty of real browsers still don't have -
  `src/polyfills.ts` supplies it when missing (confirmed as a real,
  reproducible cause of "download but just show blank pages", not just a
  test-tooling gap). Its wasm-backed image codecs (JBig2/JPEG2000 - used by
  this dataset's scanned hagahos images), `cmaps/`, and `standard_fonts/`
  are copied from `node_modules/pdfjs-dist` into `public/` at dev/build time
  (`vite.config.ts`'s `copyPdfAssets`) since pdf.js fetches them by a
  hardcoded filename rather than a normal JS import - without this, PDFs
  with those embedded images silently render with the image missing.
- `src/screens/SettingsScreen.tsx` — lets the user prefer one hanacha
  (Sichos Kodesh, Sefer HaSichos/HaMaamarim, or Toras Menachem - three
  real, distinct transcript series, persisted via `localStorage`) for
  occasions whose PDFs cite more than one (see `packages/catalog`'s
  `classifyPdfEdition`/`sortPdfsByEditionPreference`).
- `src/catalog/data/` — the same per-year static JSON bundled into
  `apps/mobile`, generated by `packages/catalog`'s `bin/build.ts`.
- `src/download/download.ts` — fetches audio/PDFs from the deployed
  `services/media-proxy` Worker (see `src/config.ts` for the base URL).
- `vite.config.ts` — `vite-plugin-pwa` in `generateSW` mode: precaches the
  app shell, and runtime-caches media-proxy responses (`CacheFirst`,
  `rangeRequests: true`, `cacheableResponse: { statuses: [0, 200, 206] }`)
  so downloaded media survives offline and supports seeking.

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

## Deployment

Deployed to Vercel (root directory `apps/web`, framework preset Vite) —
auto-deploys on push via Vercel's GitHub integration.
