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
- Validation for future PDF work should use the same command set listed
  under **Phase 3B required command set** below, plus a local emulator run
  (`npm run android:smoke`, then the UI walkthrough) for runtime
  verification.

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
  `downloadSettings.ts`). That one switch also registers a WorkManager
  periodic job (`BackgroundSyncScheduler`, every 6 h, battery-not-low, no
  network constraint of its own) - there is no separate "also when the
  app is closed" question; a phone that downloads the week does so on its
  own, opened or not.
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
  `App.tsx`). Texts come from JS in the user's language, and so do the
  names in them: a download notification names a recording by its chapter
  in the UI language (`downloadTargetTitle` in packages/app-core), and the
  player's notification and lock-screen tracks carry the occasion and
  chapter names in it too (`trackMetadata` in `src/player/playlist.ts`),
  renamed in place when the language changes.

To exercise it on a device: Settings > Offline & downloads > "Download
this week now", then pull down the notification shade. `adb shell cmd statusbar
expand-notifications` does the same from a terminal, and the walkthrough
script screenshots it.

## Phone-only: offline packs and sharing

Settings > Offline packs (`src/offline/`, `android/.../offline/PackModule.kt`;
the plan is `docs/offline-plan.md`, WP4) brings farbrengens onto a phone
with no internet at all:

- **Signed packs** (`.skpack`, built by `services/pack-builder`). The
  manifest is the ZIP's first entry. Its Ed25519 signature is checked in
  JS (`packages/pack-format`, tweetnacl), and the delta against what the
  phone holds is computed there too. The native module then streams the
  ZIP once with `ZipInputStream`. It hashes every object on the way and
  moves each into place only when its SHA-256 and size match the
  manifest. `objects.json` and a newer `catalog.json` come in the same
  pass, checked against the signed stamps.
- **Shared ZIPs and folders**: what bochurim pass around, or another
  phone's export. Every file is staged and hashed natively. A hash that a
  trusted objects index knows is stored. A file named like a JEM
  recording or a Drive PDF is kept only when the catalog lists it, the
  index does not contradict it, and the phone has no copy yet. It is
  recorded as unverified, so a signed pack's copy later replaces it. A
  pack this build does not trust (unsigned, or signed with an unknown key)
  is read the same way: its manifest only names the `objects/<sha256>`
  entries, and each entry's bytes must hash to its name.
- **Where files go.** Imported files land at the paths the downloader
  already uses: `DocumentDir/<workerFilename>` and
  `DocumentDir/<driveFileId>.pdf`. Each gets a `StoredDownloadRecord`
  (`upsertStoredDownloads`), so every screen, the player and the PDF
  viewer see them as downloaded with no new lookup. `objectStore.ts` keeps
  the index by hash (`files/offline/held-objects.json`). Audio imports in
  `src` (the original MP3) and, since 1.8.0, `opus16`, `opus24` and
  `opus32`. An Opus encoding lands beside the MP3's name, under its
  profile (`JEMSK0562A.opus16.opus`). The player and every "downloaded"
  check look for the MP3 first, then the Opus encodings, largest first
  (`placement.ts`'s `audioFileNames`). `mp3-32`, meant for MP3 players,
  is skipped and counted.
- **The shared folder**, picked once through the Storage Access Framework
  and kept across restarts (Documents/SichosKodesh):
  - `import/`: everything dropped here is imported on launch and whenever
    the app comes back to the foreground. A file that imported cleanly is
    deleted.
  - `export/`: "Share a month or a year" writes a stored ZIP here, with an
    unsigned manifest first, Hebrew folders (`תשל״ו/תשרי/י״ג - …/`) and
    upstream file names.
  - `state/`: `have.json` and `device.json`, for the yeshiva station.
- **Trust.** Release builds trust only `TRUSTED_PACK_KEYS`. Debug builds
  (`__DEV__`) also trust the published development key, so a pack built
  after `sk-pack keygen --dev` imports as a pack in a debug build run
  against Metro.
- **Progress.** One line on the Offline screen, and a strip above the
  player bar while an import or export runs. About lists the imported
  packs.

## Phone-only: the library

Home > Library (`src/library/libraryModel.ts`, `src/screens/library/`)
browses catalog schema 2's `library`:

- the farbrengens by mafteiach's 101 moadim and 53 parshiyos;
- each collection on its own axes (Likkutei Sichos by volume, parsha or
  moed; maamorim by year or Melukat volume; yomanim and reshimos by year;
  michtavim by moed or year; hadranim by masechta or year; JEM events by
  year or type);
- each item's facts, recordings and PDFs.

Library audio plays through the same player and progress store, keyed by
a negative per-item playlist id (`playlistOccasionId`). An item's Download
pill queues one `DownloadTarget` per file (`libraryDownloads.ts`, keys
`lib:<collection>:<item>:<kind>:<id>`) through the same queue, executor
and paths as a farbrengen's. Storage usage and "Delete all" include
library files. The Downloaded screen lists fully downloaded library items;
deleting one never removes a file that a downloaded farbrengen also uses. Library PDFs open
in `PdfViewerScreen` with a `library` route param (no farbrengen, no
saved page). The bundled library is read on first use, not at start-up.

## Not built yet

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

The emulator tests run locally only, never in CI (there is no CI emulator
workflow).

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
skip, not a test pass. It does **not** count as runtime verification: run
the smoke test and the UI walkthrough on a machine with an emulator or a
connected phone.

Each local run writes its logs and screenshots to
`apps/mobile/smoke-artifacts/`:
- `metro-smoke.log`
- `android-smoke-logcat.log`
- `android-smoke-screenshot.png`
- `gradle-build.log`
- `ui/`, the UI walkthrough's screenshots

### Manual notification-cancel verification checklist

Use a local emulator or device and:

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
runtime verification must come from a machine that has one. There is no
CI emulator run.

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

The APKs people actually install come from GitHub instead: Actions →
"Android Signed Release APK" → Run workflow (on `main`, once the version
bump is merged). `.github/workflows/android-release-apk.yml` builds the
signed APKs with the repository's keystore secrets, one per phone ABI plus
a universal one (`./gradlew assembleRelease -PabiSplits=true
-PreactNativeArchitectures=armeabi-v7a,arm64-v8a`), and publishes them as
the GitHub Release of tag `v<versionName>` - which it creates at that
commit - with `scripts/release-notes.ts`'s rendering of the version's
`src/changelog.ts` entry as the notes. The Releases tab is where a phone
downloads the APK from; the workflow artifact carries the same files.

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
  facing) - the release workflow refuses to run without it, since it is
  the release notes.
- Merge, then run "Android Signed Release APK" on `main` (above). It tags
  the commit `vX.Y.Z` and publishes the APKs, named after the version and
  ABI: `sichos-kodesh-1.2.0-arm64-v8a.apk` (the one for phones),
  `sichos-kodesh-1.2.0-armeabi-v7a.apk` (old 32-bit phones) and
  `sichos-kodesh-1.2.0-universal.apk` (both).

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
