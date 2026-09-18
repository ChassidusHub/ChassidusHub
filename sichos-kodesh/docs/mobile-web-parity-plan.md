# Mobile / Web Parity Plan

This document tracks the incremental work to bring `apps/mobile` (React
Native / Android) to full visual and functional parity with `apps/web`.

---

## Phase 0 — Shared `@sichos-kodesh/app-core` (completed)

Extracted platform-neutral product logic from `apps/web` into a new shared
package `packages/app-core` (`@sichos-kodesh/app-core`).  Web now consumes
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
| `npm run typecheck -w @sichos-kodesh/mobile` | ✅ PASS |
| `npm run lint -w @sichos-kodesh/mobile` | ✅ PASS |
| `npm run test -w @sichos-kodesh/mobile` | ✅ PASS (1/1) |
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

- `apps/mobile` now has a real foreground download provider backed by AsyncStorage + `react-native-blob-util`, with shared target planning from `@sichos-kodesh/app-core`.
- `Downloaded` and `DownloadSettings` are now real mobile screens, with persisted download preferences and app-owned file cleanup.
- This is still intentionally limited to foreground / resume-on-open groundwork. True Android background or resumable native downloading remains a later phase and should reuse the provider, settings, and target-planning contracts introduced here.

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

## Next recommended phases

### Phase 2A — i18n / settings / search parity (recommended next)

Use `@sichos-kodesh/app-core` search helpers to wire up the Search
placeholder screen with real smart-query search.  Add language setting
(Hebrew / English UI) using the existing `@hebcal/core` locale support.
Extend Settings with download preferences, syncing shape with the web
`useSettings` store.

### Phase 2B — Download UI parity

Wire the Downloaded placeholder screen to a real download store backed by
`react-native-blob-util`.  Show per-item download progress, allow deleting
downloaded files, show storage usage.  Use `@sichos-kodesh/app-core`
`downloadTargets` for target derivation, mirroring the web download manager.

### Phase 3 — Native Android media integration

Replace `react-native-sound` with `react-native-track-player` for proper
Android media session, lock-screen controls, and background playback.
Implement the global player bar (`BottomAudioPlayer` → sticky bar) mirroring
the web `GlobalPlayerBar`.

### Phase 4 — Full feature parity

FarbrengenScreen, RecordingsScreen, CategoryScreen, bulk downloads,
auto-download settings, connectivity banner, app update UX.
