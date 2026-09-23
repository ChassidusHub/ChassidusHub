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
- Dark-mode PDF inversion matches the web's `invert(1) hue-rotate(180deg)`
  CSS filter: the same two functions applied through React Native's own
  `filter` style on the viewer's wrapper (`PdfViewerScreen`), which Android
  renders over the native PDF view and its pages alike.
- Validation for future PDF work should use the same command/workflow set
  listed under **Phase 3B required command set** below, plus the PR-triggered
  `mobile-android-smoke.yml` workflow for honest runtime verification.

## Phase 5C PDF reader polish status

- Added `src/pdf/pdfReaderSettings.ts` for persisted PDF reader preferences
  (dark-mode toggle + zoom range preset), with corrupt-storage-safe parsing.
- `PdfViewerScreen` now shows reader-local controls for:
  - dark PDF mode toggle,
  - zoom range preset toggle,
  - current zoom scale + pinch/pan guidance.
- Dark PDF mode inverts the page colours (React Native `filter` style, see
  Phase 5B above), governed by the "Invert PDF colors in dark mode" setting.
- Invalid/stale PDF route context now shows a clearer empty/error state
  (`pdfRouteStaleHelp`) instead of trying to open ambiguous params.
- Manual runtime checklist for emulator/device verification:
  1. Open PDFs from Farbrengen, Category, and OccasionDetail flows.
  2. Confirm last-read page restore on reopen.
  3. Toggle dark PDF mode and verify overlay behavior.
  4. Toggle zoom preset and verify pinch-zoom range changes.
  5. Confirm pinch/pan works and rotate device if available.
  6. Confirm global player bar does not obscure reader controls.

## Phone-only: background sync and notifications

Two things a phone can do that the web app cannot (`src/background/`,
`android/.../background/`):

- **Background auto-download.** Auto-download is on from the first launch
  on the phone (Wi-Fi only; the web keeps it opt-in - see
  `downloadSettings.ts`), and its "Also when the app is closed" option
  (default on) registers a WorkManager periodic job
  (`BackgroundSyncScheduler`, every 6 h, battery-not-low, no network
  constraint of its own).
  `BackgroundSyncWorker` starts the React runtime in-process when the app
  isn't running and runs the headless JS task `SichosKodeshBackgroundSync`
  (`backgroundSyncTask.ts`, registered in `index.js`): it resolves this
  week's occasions from the download settings exactly as the in-app
  sync-on-open does (`resolveAutoDownloadEntries`), records them in the
  auto-download ledger, and hands every missing file to the existing
  `DownloadWorker` (Wi-Fi-only honoured per file). "Download this week
  now" in the download settings runs the same task once, immediately.
- **Notifications** (`AppNotifications.kt`, two channels): once per Hebrew
  week, "This week's farbrengens are in" - which year lines up and how many
  farbrengens - opening This Week for that year; and "Ready to use
  offline" when the last file of an automatic batch lands (posted by
  `DownloadWorker` itself, so it fires whether the batch came from the
  headless task or from the app), opening Downloaded content. Both are
  toggles under Settings > Notifications; turning one on asks for the
  Android 13+ permission, and the first launch asks once. Deep links use
  the `sichoskodesh://` scheme (manifest intent filter + `linking` in
  `App.tsx`). Texts come from JS in the user's language.

To exercise it on a device: Settings > Offline & downloads > "Download
this week now", then pull down the notification shade. `adb shell cmd statusbar
expand-notifications` does the same from a terminal, and the walkthrough
script screenshots it.

## Not built yet

- Batch month/year downloads, zip bundling.
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

## Android native background downloader (Phase 4C)

Downloads on Android are now routed through a WorkManager-backed native bridge
(`SichosKodeshDownloader`) that survives process death.

| Component | Location |
|-----------|----------|
| Worker | `android/app/src/main/java/com/sichoskodeshmobile/download/DownloadWorker.kt` |
| Native module | `android/.../download/DownloadModule.kt` |
| ReactPackage | `android/.../download/DownloadPackage.kt` |
| Cancel receiver/helper | `android/.../download/DownloadCancelReceiver.kt`, `DownloadCancellation.kt` |
| JS wrapper | `src/download/nativeDownload.ts` |
| Executor (routing) | `src/download/downloadExecutor.ts` |

**Fallback:** When `SichosKodeshDownloader` is unavailable (Jest, iOS, missing
link) `isNativeDownloaderAvailable()` returns `false` and
`downloadExecutor.ts` falls back automatically to the existing
`react-native-blob-util` foreground path. All tests run with the fallback path
so no mocking of the native module is required in Jest.

### Phase 4C status

- Native download notifications now include a per-download **Cancel** action.
  The action targets the specific `targetKey`, cancels only that WorkManager
  job, and routes through the same native cancellation helper used by JS
  `cancelDownload`.
- Native cancellation now deletes the matching `.part` file before canceling
  work, so an explicitly canceled download does not get treated like resumable
  in-progress state on the next retry.
- WorkManager `CANCELLED` is now emitted to JS as
  `SichosKodeshDownloadCanceled` instead of a generic error. `DownloadProvider`
  maps that to the existing `'canceled'` state, so `DownloadedScreen` and
  follow-up download actions do not get stuck at `'downloading'`.
- On app launch and when the app returns to the foreground, the provider asks
  native code for the currently active WorkManager downloads and reconciles any
  missing native work back to non-completed state. Completed files still win via
  the shared AsyncStorage/file ledger; canceled native work is not marked as
  downloaded.

### Persistence / verification notes

- **Implemented:** WorkManager-backed durable work, process-death-safe queueing,
  `.part` file atomic rename, HTTP Range resume for non-canceled partials,
  notification cancel action, and JS reconciliation for canceled native work.
- **Not overclaimed:** local agent VMs still do **not** provide real runtime
  proof for process-kill, reboot persistence, or OEM-specific notification
  behavior.
- **What WorkManager handles automatically:** persisted work database and
  reboot/process restoration for pending work.
- **What still needs real-device/emulator validation:** notification action
  behavior from lock screen/shade, persistence after force-stop/process kill,
  reboot continuation across API/OEM variants, and any interaction with player
  lock-screen media notifications.



### Android agent testing / playground

| Path | Command | Device required | Used in |
|---|---|---|---|
| Pre-build gate | `npm run prebuild:check -w @sichos-kodesh/mobile` | No | Every `android:release` / `android:assembleDebug` |
| Build-only | `npm run android:smoke:buildonly -w @sichos-kodesh/mobile` | No | Any VM / local |
| Local smoke | `npm run android:smoke -w @sichos-kodesh/mobile` | Yes (exit 2 if none) | Local dev machine |
| UI walkthrough | `npm run android:ui-walkthrough -w @sichos-kodesh/mobile -- <apk> [out-dir]` | Yes | Before handing out an APK |
| CI emulator smoke | `mobile-android-smoke.yml` GitHub Actions workflow | Provided by CI | GitHub Actions |

**Pre-build gate** (`scripts/prebuild-check.sh`) runs automatically in front
of `npm run android:release` and `npm run android:assembleDebug`: it rebuilds
the workspace packages, re-applies the react-native-track-player source
patch, checks the bundled Noto Sans fonts are present, refuses any emoji in
UI source (every glyph comes from `lucide-react-native`), then typechecks,
lints and runs the unit tests. Nothing here needs a device; a failure means
no APK.

**UI walkthrough** (`scripts/android-ui-walkthrough.sh`) is the "does the
UI actually show up and work" check: it installs an APK on the connected
device/emulator and taps through every screen the way a person would (kvius
years → this week → occasion → recordings → play → PDF → all-years lists →
browse → search → settings → dark mode → Hebrew), screenshotting each one.
Taps are found by on-screen text via `uiautomator dump`, so the script works
on any screen size and fails loudly (with a screenshot of what was actually
there) when an expected label is missing. Logcat is scanned for crashes at
the end. Screenshots land in `smoke-artifacts/ui/` by default.

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

### Manual notification-cancel verification checklist

Use an emulator/device (local or `mobile-android-smoke.yml` artifacts/logs) and:

1. Start a download from `Downloaded`/occasion UI.
2. Confirm the Android foreground download notification appears with a
   **Cancel** action.
3. Tap **Cancel** in the notification shade/lock screen.
4. Re-open the app and confirm the item is no longer stuck in
   `queued`/`downloading`.
5. Confirm no completed download record was created for the canceled item.
6. Retry the same download and confirm it starts fresh (the canceled `.part`
   file was cleaned up).

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

For a release APK: `npm run android:release -w @sichos-kodesh/mobile`
(the pre-build gate above, then `./gradlew assembleRelease`), output at
`android/app/build/outputs/apk/release/app-release.apk` (this uses the
same release signing config as the `.aab` build below). Run the UI
walkthrough against it before handing it to anyone.

### Versioning and releases

**1.0.0 is version 1**: the first release APK, `versionCode 1`, built from
commit `17e14b4` (git tag `v1.0.0`, annotated; the tag was created in the
session that built it, which could push the branch but not tags, so push
it from a checkout with tag access: `git push origin v1.0.0`).

Everything after that APK is a new release, never a rebuild under the same
number:

- Fixes to version 1 ship on the **1.x line** - `1.0.1`, `1.1.0`, `1.1.9`,
  and so on - until version 2 comes out. Patch for fixes, minor for
  anything a user would notice as new.
- Every release bumps all three copies of the version together (there is
  no build step deriving one from another): `src/version.ts`
  (`APP_VERSION`, shown in About), `package.json` `"version"`, and
  `android/app/build.gradle` `versionName` - plus `versionCode`, which
  goes up by one on every build handed to anyone, since Android refuses
  to install an APK whose `versionCode` isn't higher than the one
  already on the phone.
- Add the release's entry to `src/changelog.ts` (most recent first, user
  facing) and tag the commit it was built from: `git tag -a vX.Y.Z -m
  "Sichos Kodesh mobile X.Y.Z"`.
- A release APK is named after its version and ABI when handed out, e.g.
  `sichos-kodesh-1.0.0-universal.apk` (armeabi-v7a + arm64-v8a, the one
  to give to phones) or `sichos-kodesh-1.0.0-phone-arm64.apk`.

## Google Play (Internal testing track)

A signed release `.aab` is what Play wants (it splits per-device at
install time, unlike a debug APK which bundles all CPU architectures
unsplit). `.github/workflows/android-aab.yml` builds one on demand
(Actions → "Android Signed Release Bundle" → Run workflow) from the
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` repository secrets, and
uploads it as a workflow artifact.

To build one locally instead (first time: generate an upload key):

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
