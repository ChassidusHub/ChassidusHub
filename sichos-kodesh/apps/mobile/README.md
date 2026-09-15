# @sichos-kodesh/mobile

Pick a kvius-matched Hebrew year, see every occasion with real content in
the current Hebrew week — Shabbos and weekday farbrengens alike — then
download and play/read it fully offline.

Bare React Native CLI, **not Expo** — a plain Gradle Android project that
produces a real installable APK, no Expo/EAS account needed.

## What's here

- `@sichos-kodesh/catalog`'s `resolveThisWeek` (shared with `apps/web`)
  resolves every occasion with real content anywhere in the current
  Hebrew week against the chosen source year — a plain day-by-day catalog
  lookup, not the kvius engine's `occasionKey` matching (see that
  package's README for why kvius-matched years make that safe).
- `@sichos-kodesh/catalog`'s bundled JSON (`src/catalog/data/`, generated
  from the crawled dataset — 3,330 occasions, regenerate with
  `npm run build-catalog` in `packages/catalog`) backs the catalog lookups
  used across the app. An occasion counts as having content when it has
  audio or a PDF — a transcript with no audio is still real content.
- Two ways to pick a year, both on `YearPickerScreen`: **Follow along**
  (kvius-matched years only, via `findMatchingYears`, leads to
  `ThisWeekScreen`'s list of this week's occasions) and **Browse any
  year** (every indexed year from 5710 onward via `browsableYears`, no
  kvius match required, leads to `YearBrowserScreen`'s list of that
  year's occasions, grouped by Hebrew month — a browsed year has no
  guaranteed week/date alignment with the current Hebrew year, so there's
  no "this week" to compute). The 5710 floor matches this app's scope:
  the current Rebbe's own sichos, not the Previous Rebbe's pre-Nesius
  farbrengens. Both screens are list-then-detail: tap a date to see its
  categories/downloads.
- `src/components/OccasionDetail.tsx` — the shared download/read card
  used by both `ThisWeekScreen` and `YearBrowserScreen`. Groups content
  into labeled categories (Audio, then each PDF section present, sorted
  so a PDF matching the user's edition preference comes first) rather
  than one flat pile of buttons.
- Downloads go through `services/media-proxy`'s `/jem-audio/:filename`
  and `/drive/:fileId` routes (`src/download/download.ts`), never a
  direct CloudFront/Drive URL. PDFs render directly in-app via
  `react-native-pdf` (`src/screens/PdfViewerScreen.tsx`) rather than
  handing off to the OS's own viewer, so an occasion's own recording can
  keep playing in a persistent bottom bar (`BottomAudioPlayer`) while its
  pages are scrolled through.
- A farbrengen is usually several separate recordings, not one (a few
  sichos, a maamar, niggunim between them), so `BottomAudioPlayer` plays
  through them as real chapters: prev/next skip, an expandable chapter
  list with each recording's name and duration, and auto-advance into the
  next chapter when one ends.
- Audio playback (`src/audio/loadCachedSound.ts`) downloads a chapter to
  `RNBlobUtil.fs.dirs.DocumentDir` (persistent storage, not a cache
  directory the OS can evict) in full before playback starts, or plays
  the cached copy directly if a previous play already downloaded it —
  shown only as a silent "Loading..." state, one download at a time.
  `download.ts`'s `downloadTo` writes to a `.part` path and only moves it
  to the real destination once a download finishes, so a half-written
  file from an interrupted download is never mistaken for a valid cached
  copy.
- A settings screen (`src/screens/SettingsScreen.tsx`) lets the user
  prefer one hanacha (Sichos Kodesh, Sefer HaSichos/HaMaamarim, or Toras
  Menachem — three distinct transcript series, persisted via
  AsyncStorage). `OccasionDetail` puts PDFs matching that preference
  first within each category (see `packages/catalog`'s
  `classifyPdfEdition`/`sortPdfsByEditionPreference`) without hiding the
  other editions.

## Not built yet

- Batch month/year downloads, zip bundling.
- Background/resumable downloads — a single foreground download is
  enough for one file at a time.
- A gap-handling UI with manual overrides (a gap just shows a plain
  message right now).

## Media proxy

`src/config.ts`'s `MEDIA_PROXY_BASE_URL` points at the deployed Worker
(`services/media-proxy`). Redeploying that service updates the same URL
in place; no change needed here unless the Worker itself is renamed or
moved.

## Running it

This app lives inside an npm workspace monorepo (see the repo root
`package.json`) — install from the repo root, not from here alone, so
`@sichos-kodesh/kvius-engine` and `@sichos-kodesh/catalog` resolve as
workspace packages:

```sh
npm install                       # from the repo root
```

Then, from `apps/mobile`:

```sh
npm start                         # Metro
npm run android                   # needs an Android SDK/emulator/device attached
npm run ios                       # needs Xcode/an iOS simulator or device
npm run typecheck
npm test
npm run lint
```

`@sichos-kodesh/kvius-engine` and `@sichos-kodesh/catalog` are resolved
via their built `dist/` output, not source — `start`/`android`/`ios`/
`test`/`typecheck` all build both first automatically (`pre<script>` npm
hooks), so no separate manual build step is needed.

### Getting an APK

There's no CI for this app. To get a debug APK: `npm run android` with a
local Android SDK/emulator/device attached. For a release APK without a
device attached: `cd android && ./gradlew assembleRelease`, output at
`android/app/build/outputs/apk/release/app-release.apk` (this uses the
same release signing config as the `.aab` build below).

## Google Play (Internal testing track)

Not currently set up. A signed release `.aab` (what Play wants — it
splits per-device at install time, unlike a debug APK which bundles all
CPU architectures unsplit) would need its own build step, since none of
this repo's workflows build one today.

To build one locally:

```sh
keytool -genkeypair -v -storetype PKCS12 \
  -keystore sichos-kodesh-upload.keystore -alias sichos-kodesh-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Copy `android/keystore.properties.example` to
`android/keystore.properties` (gitignored) and fill in the real values
(keystore path, alias, and both passwords), then build the `.aab`:

```sh
cd android && ./gradlew bundleRelease
```

The output lands at `android/app/build/outputs/bundle/release/app-release.aab`.

**Keep the `.keystore` file somewhere safe outside this repo** (it's
gitignored — `*.keystore` except `debug.keystore` — and must never be
committed). It's the app's Play "upload key" identity; with Google Play
App Signing (recommended, required for new Play apps) Google holds the
true signing key and the upload key can be reset via Play Console if
lost.

Once built, upload the `.aab` manually via Play Console → your app →
**Internal testing** → Create release.

### A monorepo build wrinkle

`android/settings.gradle`'s `includeBuild(...)` path points at
`../../../node_modules/@react-native/gradle-plugin`, not the RN CLI's
default `../node_modules/@react-native/gradle-plugin`, because npm
workspace hoisting puts that package at the repo root, not in this app's
own `node_modules`. If `android/` is ever regenerated from a fresh CLI
template, reapply this fix (it's also commented inline in that file).
