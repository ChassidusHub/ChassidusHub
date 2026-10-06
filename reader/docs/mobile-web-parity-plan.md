# Mobile / Web Parity Plan

This document tracks the incremental work to bring `apps/mobile` (React
Native / Android) to full visual and functional parity with `apps/web`.

---

## Phase 0 — Shared `@chassidushub-reader/app-core` (completed)

Extracted platform-neutral product logic from `apps/web` into a new shared
package `packages/app-core` (`@chassidushub-reader/app-core`).  Web now consumes
pure logic via thin adapters.  Mobile can import from the same package
without pulling in any browser-only code.

Shared modules:
- `search/parseSmartQuery`, `search/searchOccasions`, `search/parshaOptions`, `search/specialDayOptions`
- `download/downloadTargets`
- `progress/audioProgress`
- `utils/formatDuration`, `utils/formatHebrewDate`, `utils/groupByMonth`

---

## Phase 1A — React Navigation + typed route skeleton (completed)

- Replaced ad-hoc `view.kind` switch with `@react-navigation/native-stack`.
- Added fully-typed `RootStackParamList` covering all planned routes.
- Added minimal UI primitives: `theme.ts`, `Screen.tsx`, `ScreenHeader.tsx`.
- All unimplemented routes wired to `PlaceholderScreen`.

---

## Phase 1B — Mobile UI/app-shell parity foundation (completed)

Goal: make the real mobile screens and app shell visually align much more
closely with `apps/web`, without implementing native media playback,
background downloads, or full feature parity.

### Changes

**UI design system (`apps/mobile/src/ui/`)**

| File | Purpose |
|------|---------|
| `theme.ts` | Updated to green brand accent `#1a8a4a` (light) / `#1ed760` (dark), web-aligned bg/card/muted/border tokens |
| `AppText.tsx` | Typed text component with `variant` + `color` props |
| `AppButton.tsx` | Branded button (primary / secondary / ghost variants) |
| `Card.tsx` | Rounded card surface matching web `--card-bg` |
| `ListRow.tsx` | Standard list row + `RowSeparator` |
| `SectionLabel.tsx` | Muted uppercase section header |
| `EmptyState.tsx` | Centered zero-state message |

**Screens refactored**

- `YearPickerScreen` — home layout closer to web: app title, year/kvius badge, primary "Follow Along" CTA, secondary "Browse Any Year", honest placeholder links for Search/Downloaded
- `KviusYearsScreen`, `BrowseYearsScreen` — `ScreenHeader` + `ListRow`/`RowSeparator`/`EmptyState`
- `ThisWeekScreen`, `YearBrowserScreen` — `ScreenHeader` + inline detail view using `SectionLabel`
- `SettingsScreen` — `ScreenHeader` + `ListRow` with sublabels
- `OccasionDetail` — `Card` for audio/PDF entries, green accent play/read buttons
- `PlaceholderScreen` — uses `EmptyState`, clear "not yet implemented" messaging

### Navigation flows preserved

- Home → KviusYears → ThisWeek → OccasionDetail → PdfViewer ✓
- Home → BrowseYears → YearBrowser → OccasionDetail → PdfViewer ✓
- Home → Settings ✓
- All placeholder routes still reachable ✓

### Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck -w @chassidushub-reader/mobile` | ✅ PASS |
| `npm run lint -w @chassidushub-reader/mobile` | ✅ PASS |
| `npm run test -w @chassidushub-reader/mobile` | ✅ PASS (1/1) |
| `cd apps/mobile/android && ./gradlew assembleDebug` | ❌ Sandbox network failure — see note below |

> **Android Gradle note:** The sandbox environment does not have a full
> Android SDK / Java toolchain available; if the build fails it will be due
> to the known `org.gradle.toolchains.foojay-resolver-convention` plugin
> resolution or missing SDK — not from the TypeScript/UI changes in this PR.
> No TypeScript or UI-layer code was changed that would affect the Android
> native build.

Android emulator / device testing was not available in this sandbox.

---

## Phase 2B — Download UI/state MVP groundwork (completed)

- `apps/mobile` now has a real foreground download provider backed by AsyncStorage + `react-native-blob-util`, with shared target planning from `@chassidushub-reader/app-core`.
- `Downloaded` and `DownloadSettings` are now real mobile screens, with persisted download preferences and app-owned file cleanup.
- This is still intentionally limited to foreground / resume-on-open groundwork. True Android background or resumable native downloading remains a later phase and should reuse the provider, settings, and target-planning contracts introduced here.

---

## Phase 4A — Android native background/resumable downloader groundwork (completed)

### Architecture

The foreground-only RNBlobUtil download path is now complemented by a native
Android downloader bridge:

| Layer | File | Notes |
|-------|------|-------|
| WorkManager worker | `android/.../download/DownloadWorker.kt` | CoroutineWorker; streams to `.part`, renames when complete; HTTP Range resume on existing `.part`; foreground notification |
| Native module | `android/.../download/DownloadModule.kt` | `SichosKodeshDownloader` exposed to JS; enqueues unique WorkManager tasks; emits progress/complete/error via `DeviceEventEmitter` |
| ReactPackage | `android/.../download/DownloadPackage.kt` | Registered in `MainApplication.kt` |
| JS wrapper | `src/download/nativeDownload.ts` | Returns `null`/no-op in Jest/non-Android; safe fallback |
| Executor | `src/download/downloadExecutor.ts` | Chooses native vs. foreground; exports event subscription helper |
| Provider | `src/download/DownloadProvider.tsx` | Native-enqueued targets leave blocking queue immediately; events finalize ledger |

### What is implemented

- WorkManager-backed download survives process death (durable queue).
- `.part`-file atomic rename eliminates partial-file corruption.
- HTTP `Range` resume header sent when `.part` exists (proxy supports it).
- Progress events bridged to JS; DownloadProvider updates `targetStates` in real time.
- Completed native downloads upsert the same AsyncStorage ledger used by DownloadedScreen and cached-file playback.
- Foreground fallback preserved for non-Android / Jest contexts.
- `assembleDebug` BUILD SUCCESSFUL (314 tasks).

### Validation results

| Command | Result |
|---------|--------|
| `npm run test -w @chassidushub-reader/mobile` | ✅ PASS (22/22 tests, 11 new) |
| `npm run typecheck -w @chassidushub-reader/mobile` | ✅ PASS |
| `npm run lint -w @chassidushub-reader/mobile` | ✅ PASS |
| `npm run android:smoke:buildonly -w @chassidushub-reader/mobile` | ✅ APK confirmed, exit 0 |
| `npm run android:smoke` (runtime) | ⚠️ Skipped — no emulator in agent VM. Run it locally on a machine with an emulator or phone. |

### Phase 4B remaining gaps

- **Real-device/emulator verification** — lock-screen notification UX, background execution confirmed alive after app kill.
- **Wi-Fi-only enforcement** — `NetworkType.UNMETERED` constraint, gated by user setting.
- **Notification UX** — per-download progress notification with cancel action.
- **Resumability confirmation** — HTTP Range path exists in `DownloadWorker`; needs end-to-end test against media-proxy with a real partial `.part` file.
- **iOS** — native module returns `null` on iOS; foreground fallback only until a separate iOS download path is added.
- **Reboot persistence** — WorkManager re-enqueues on reboot by default; verify with `RECEIVE_BOOT_COMPLETED` test if needed.

## Phase 4C — Android downloader notification cancel + verification hardening (completed)

### What changed

- `DownloadWorker` notifications now expose a per-download **Cancel** action.
- Native cancellation is centralized in `DownloadCancellation.kt` and reused by:
  - JS `cancelDownload`
  - notification `BroadcastReceiver`
- Cancel now removes the target `.part` file before canceling WorkManager, so
  explicitly canceled downloads do not look resumable/completed later.
- `DownloadModule` now emits a dedicated `SichosKodeshDownloadCanceled` event
  for WorkManager `CANCELLED` instead of collapsing cancel into generic error.
- `DownloadProvider` now:
  - maps native canceled events to the existing `'canceled'` state
  - reconciles native pending work on launch and app foreground by asking the
    native module which WorkManager downloads are still active
  - avoids treating canceled/missing native work as completed unless the final
    downloaded file is actually present in the shared ledger/filesystem view

### Automated verification this phase

| Command / workflow | Coverage |
|---|---|
| `npm run test -w @chassidushub-reader/mobile` | Jest coverage including native cancel event + provider reconciliation |
| `npm run typecheck -w @chassidushub-reader/mobile` | TS integration for provider/native wrapper changes |
| `npm run lint -w @chassidushub-reader/mobile` | lint for new provider/tests/docs-adjacent code |
| `npm run test -w @chassidushub-reader/app-core` | shared package regression guard |
| `npm run typecheck -w @chassidushub-reader/app-core` | shared package regression guard |
| `npm run android:smoke:buildonly -w @chassidushub-reader/mobile` | APK build verification without device |
| `npm run android:smoke` + `android:ui-walkthrough` (local) | emulator install/launch smoke and screen walkthrough, run locally (never in CI) |

### Remaining real runtime gaps

- Local agent VMs still cannot treat `npm run android:smoke` as runtime proof
  when no device/emulator is attached (expected exit `2`).
- Process-kill persistence, reboot continuation, and notification behavior from
  the lock screen / OEM-specific notification UIs still require emulator or
  physical-device validation.
- WorkManager persistence is architecture-supported, but this phase does **not**
  claim full reboot/process-kill verification without those runtime checks.

---

## Phase 3B — Mobile native player hardening (completed)

- Added persisted playback progress for mobile TrackPlayer playback using
  AsyncStorage with corrupt/stale payload guards.
- Progress keys are stable per occasion/chapter (`hebrewYear`,
  `occasionId`, `workerFilename`) rather than list-index only.
- Playing an occasion now resolves a resume chapter/position from persisted
  progress and seeks there automatically.
- Track mapping now checks app-owned audio files in
  `RNBlobUtil.fs.dirs.DocumentDir` and uses `file://` URLs when present,
  with proxy URL fallback when files are absent.
- Loading/error handling was hardened to avoid stuck transient loading
  state and to surface TrackPlayer setup/playback errors in UI.
- Android interruption groundwork now uses TrackPlayer setup
  `autoHandleInterruptions` plus `RemoteDuck` pause/resume handling in the
  playback service.
- Remaining gap for Phase 3C: explicit real-device validation of lock
  screen/media-notification/background behavior.

---

## Phase 5A — Mobile screen parity slice (in progress)

- Replaced placeholder mobile routes with real screens for:
  - `Farbrengen`
  - `Recordings`
  - `Category`
  - `MonthOccasions`
  - `FollowMonthList`
  - `FollowMonthOccasions`
  - `AllYearsThisWeek`
  - `OccasionAllYears`
- Added pure mobile route/catalog helpers for:
  - resolving occasion route params into catalog entries with safe back-paths
  - grouping year entries by month token/name
  - filtering month/category content
  - deriving cross-year occasion groups
- Updated mobile navigation flows so:
  - Home can open cross-year "this week" results
  - ThisWeek rows open Farbrengen and can drill into follow-month lists
  - YearBrowser shows month lists and drills into MonthOccasions → Farbrengen
  - Search/Downloaded rows open Farbrengen directly
- Added focused Jest coverage for the pure mobile route/catalog helper logic.

### Still remaining for fuller parity

- `About` is still a placeholder screen on mobile.
- Farbrengen/Recordings/Category are practical parity screens, not pixel-perfect
  reproductions of every web affordance.
- This Phase 5A work intentionally avoided:
  - `apps/mobile/src/download/*` internals
  - `apps/mobile/src/player/*` internals
  - Android/native downloader changes from Phase 4A

---

## Phase 5B — PDF viewer parity and reading progress (completed)

- Mobile PDF reading progress is now persisted in AsyncStorage with a stable
  per-PDF key derived from `hebrewYear`, `occasionId`, and `driveFileId`
  (`apps/mobile/src/pdf/pdfIdentity.ts`, `apps/mobile/src/pdf/pdfProgress.ts`).
- `PdfViewerScreen` now restores the last-read page on reopen, throttles page
  writes, shows `Page X / Y`, and exposes explicit Previous/Next page controls
  via `react-native-pdf`'s existing `setPage()` / `onPageChanged()` API.
- Loading/error UX is clearer: the screen now shows an in-app loading card,
  retains safe back navigation, and exposes a retry action for failed loads.
- Route/context handling is more defensive: invalid params show a polished
  empty state, while valid PDF routes preserve title/occasion/category context
  where available without depending on downloader/player/native internals.
- Dark/invert PDF rendering remains deferred: the web implementation relies on
  DOM/CSS inversion, while the current mobile `react-native-pdf` stack does
  not expose a clean equivalent without higher-risk rendering changes.

### Validation / workflow notes

- Required commands remain:
  - `npm ci`
  - `npm run test -w @chassidushub-reader/mobile`
  - `npm run typecheck -w @chassidushub-reader/mobile`
  - `npm run lint -w @chassidushub-reader/mobile`
  - `npm run test -w @chassidushub-reader/app-core`
  - `npm run typecheck -w @chassidushub-reader/app-core`
  - `npm run android:smoke:buildonly -w @chassidushub-reader/mobile`
  - `cd apps/mobile/android && ./gradlew assembleDebug --stacktrace`
  - `npm run android:smoke -w @chassidushub-reader/mobile`
- Local coding-agent VMs may still lack `adb` / an attached emulator, so
  runtime proof has to come from a local run on a machine that has one.
  There is no CI emulator run.

### Remaining PDF parity gaps

- No mobile dark/invert rendering toggle yet.
- No web-style freeform zoom/pan parity beyond `react-native-pdf`'s built-in
  gestures.
- Runtime/device verification still depends on local Android tooling or CI
  emulator availability.

---

## Phase 5C — PDF dark mode + zoom/pan polish + runtime checklist (completed)

- Added persisted mobile PDF reader settings in `apps/mobile/src/pdf/pdfReaderSettings.ts`
  with corrupt-storage-safe parsing and Jest coverage.
- `PdfViewerScreen` now includes reader-local controls for:
  - dark PDF mode toggle (applies in system dark mode),
  - zoom range preset toggle (default `1x-3x` vs expanded `0.75x-5x`),
  - live zoom scale and pinch/pan guidance text.
- Current dark-mode behavior is an intentionally safe fallback: a dim overlay on
  top of `react-native-pdf`. True pixel-level PDF color inversion is still not
  exposed by the current mobile renderer.
- Stale/invalid PDF route context is now handled with a more explicit empty
  state (`pdfRouteStaleHelp`) instead of attempting a blind open.

### Manual runtime verification checklist (emulator/device)

1. Open a PDF from **Farbrengen**.
2. Open a PDF from **Category**.
3. Open a PDF from **OccasionDetail**.
4. Confirm last-read page restores after leaving/reopening the same PDF.
5. Toggle dark PDF mode on/off and confirm dim overlay behavior in dark theme.
6. Toggle zoom range preset and verify pinch-zoom limits change accordingly.
7. Confirm pinch-to-zoom and drag-to-pan both remain usable.
8. Rotate device (portrait/landscape) and verify viewer remains usable.
9. Confirm global player bar does not hide PDF controls/page actions.

### Validation commands/workflows for future agents

- Required local commands:
  - `npm ci`
  - `npm run test -w @chassidushub-reader/mobile`
  - `npm run typecheck -w @chassidushub-reader/mobile`
  - `npm run lint -w @chassidushub-reader/mobile`
  - `npm run test -w @chassidushub-reader/app-core`
  - `npm run typecheck -w @chassidushub-reader/app-core`
  - `npm run android:smoke:buildonly -w @chassidushub-reader/mobile`
  - `cd apps/mobile/android && ./gradlew assembleDebug --stacktrace`
  - `npm run android:smoke -w @chassidushub-reader/mobile`
- Runtime smoke is confirmed locally, on a machine with `adb` and an
  emulator or phone. There is no CI emulator run.

### Remaining PDF parity gaps

- No true per-pixel PDF color inversion API from the current `react-native-pdf`
  renderer (dim-overlay fallback only).
- No dedicated on-screen +/- zoom stepper buttons (pinch/pan + range presets are
  supported).

---

## Next recommended phases

### Phase 2A — i18n / settings / search parity (recommended next)

Use `@chassidushub-reader/app-core` search helpers to wire up the Search
placeholder screen with real smart-query search.  Add language setting
(Hebrew / English UI) using the existing `@hebcal/core` locale support.
Extend Settings with download preferences, syncing shape with the web
`useSettings` store.

### Phase 2B — Download UI parity

Wire the Downloaded placeholder screen to a real download store backed by
`react-native-blob-util`.  Show per-item download progress, allow deleting
downloaded files, show storage usage.  Use `@chassidushub-reader/app-core`
`downloadTargets` for target derivation, mirroring the web download manager.

### Phase 3 — Native Android media integration

Replace `react-native-sound` with `react-native-track-player` for proper
Android media session, lock-screen controls, and background playback.
Implement the global player bar (`BottomAudioPlayer` → sticky bar) mirroring
the web `GlobalPlayerBar`.

### Phase 4 — Full feature parity

FarbrengenScreen, RecordingsScreen, CategoryScreen, bulk downloads,
auto-download settings, connectivity banner, app update UX.
