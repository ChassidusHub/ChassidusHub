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

## Phase 3B player hardening status

- The `react-native-track-player` queue now resolves each chapter URL to
  `file://...` when the downloaded chapter exists in
  `RNBlobUtil.fs.dirs.DocumentDir`, and falls back to media-proxy
  streaming when the file is missing.
- Playback progress is persisted in AsyncStorage and keyed by stable audio
  IDs (`workerFilename`) per occasion; resume position is applied when
  that occasion is played again. Corrupt/stale storage is ignored safely.
- Restore is currently resume-on-play, not auto-rebuild/auto-start of the
  last queue on app launch.
- Android interruption/focus groundwork is enabled by
  `setupPlayer({ autoHandleInterruptions: true })` plus RemoteDuck pause/
  resume handling in `src/player/trackPlayerService.ts`.
- Lockscreen/media-notification/background behavior still needs real-device
  or CI-emulator runtime verification (Phase 3C validation gap).

## Phase 5B PDF viewer parity status

- `src/screens/PdfViewerScreen.tsx` now restores the last-read page for each
  PDF and persists page progress through AsyncStorage-backed helpers in
  `src/pdf/pdfIdentity.ts` and `src/pdf/pdfProgress.ts`.
- Progress keys are stable per PDF (`hebrewYear`, `occasionId`,
  `driveFileId`) rather than route/list position only, and corrupt/stale
  storage payloads are ignored safely.
- The reader now shows clearer loading/error UI, `Page X / Y`, and explicit
  Previous/Next page controls while keeping the global audio player bar usable.
- Dark/invert PDF rendering is still deferred: the web version uses CSS/DOM
  inversion, and the current mobile `react-native-pdf` integration does not
  offer a similarly low-risk rendering toggle.
- Validation for future PDF work should use the same command/workflow set
  listed under **Phase 3B required command set** below, plus the PR-triggered
  `mobile-android-smoke.yml` workflow for honest runtime verification.

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

## Android native background downloader (Phase 4A)

Downloads on Android are now routed through a WorkManager-backed native bridge
(`SichosKodeshDownloader`) that survives process death.

| Component | Location |
|-----------|----------|
| Worker | `android/app/src/main/java/com/sichoskodeshmobile/download/DownloadWorker.kt` |
| Native module | `android/.../download/DownloadModule.kt` |
| ReactPackage | `android/.../download/DownloadPackage.kt` |
| JS wrapper | `src/download/nativeDownload.ts` |
| Executor (routing) | `src/download/downloadExecutor.ts` |

**Fallback:** When `SichosKodeshDownloader` is unavailable (Jest, iOS, missing
link) `isNativeDownloaderAvailable()` returns `false` and
`downloadExecutor.ts` falls back automatically to the existing
`react-native-blob-util` foreground path. All tests run with the fallback path
so no mocking of the native module is required in Jest.

**Phase 4B remaining gaps:** Wi-Fi-only enforcement, per-download notification
UX, real-device lock-screen/kill verification, iOS path. See
`docs/mobile-web-parity-plan.md` for the full list.



### Android agent testing / playground

| Path | Command | Device required | Used in |
|---|---|---|---|
| Build-only | `npm run android:smoke:buildonly -w @sichos-kodesh/mobile` | No | Any VM / local |
| Local smoke | `npm run android:smoke -w @sichos-kodesh/mobile` | Yes (exit 2 if none) | Local dev machine |
| CI emulator smoke | `mobile-android-smoke.yml` GitHub Actions workflow | Provided by CI | GitHub Actions |

**Important for coding agents:** Local coding-agent VMs typically lack
nested KVM (nested virtualization), so `npm run android:smoke` will exit
with code `2` ("no device connected — skipped"). That is a normal local
skip, not a test pass. It does **not** count as runtime verification.

The required runtime verification path is the GitHub Actions workflow
`mobile-android-smoke.yml`. It starts a real Android emulator via
`reactivecircus/android-emulator-runner`, installs the APK, launches the
app, collects logcat, and uploads artifacts. Exit code `2` from the smoke
script inside that workflow is treated as a **job failure** (not a skip)
because the workflow's entire purpose is to provide an emulator.

The workflow runs automatically on PRs that touch `apps/mobile/**`,
`packages/**`, `package.json`, `package-lock.json`, or the workflow
files themselves. It can also be triggered manually:

```sh
gh workflow run mobile-android-smoke.yml
```

> **Note:** GitHub only exposes `workflow_dispatch` for workflow files
> that exist on the repository's default branch. If `mobile-android-smoke.yml`
> was added in a feature branch and not yet merged, you may need to merge
> it first before the manual trigger appears in the GitHub UI.

**Artifacts** from each CI emulator run are uploaded to the
`mobile-android-smoke-artifacts` artifact bundle and include:
- `apps/mobile/smoke-artifacts/metro-smoke.log`
- `apps/mobile/smoke-artifacts/android-smoke-logcat.log`
- `apps/mobile/smoke-artifacts/android-smoke-screenshot.png`
- `apps/mobile/smoke-artifacts/gradle-build.log`
- Gradle build reports from `android/app/build/reports/`

### Phase 3B required command set

```sh
npm ci
npm run test -w @sichos-kodesh/mobile
npm run typecheck -w @sichos-kodesh/mobile
npm run lint -w @sichos-kodesh/mobile
npm run test -w @sichos-kodesh/app-core
npm run typecheck -w @sichos-kodesh/app-core
npm run android:smoke:buildonly -w @sichos-kodesh/mobile
cd apps/mobile/android && ./gradlew assembleDebug --stacktrace
npm run android:smoke -w @sichos-kodesh/mobile
```

If the local VM has no emulator/device and runtime smoke exits `2`,
runtime verification must come from the PR's
`mobile-android-smoke.yml` run (auto-triggered by path filters), or via:

```sh
gh workflow run mobile-android-smoke.yml
```

### Getting an APK

To get a debug APK without a device attached:

```sh
npm run android:smoke:buildonly -w @sichos-kodesh/mobile
# APK written to: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

For a release APK: `cd android && ./gradlew assembleRelease`, output at
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
