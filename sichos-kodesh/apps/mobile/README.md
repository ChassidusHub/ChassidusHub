# @sichos-kodesh/mobile

A thin, end-to-end proof of the whole pipeline: pick a kvius-matched
Hebrew year, see every occasion with real content in the current Hebrew
week - Shabbos and weekday farbrengens alike - download it, and play/read
it fully offline. See `docs/PLANNING.md`'s "Mobile App & Offline
Downloads" section for the full architecture context and what's
deliberately deferred to later phases.

Bare React Native CLI, **not Expo** — a plain Gradle Android project that
produces a real installable APK, no Expo/EAS account needed.

## What's real here vs. deliberately deferred

Built and working:
- `@sichos-kodesh/catalog`'s `resolveThisWeek` (shared with `apps/web`, not
  duplicated per app) resolves every occasion with real content anywhere
  in the current Hebrew week against the chosen source year - a plain
  day-by-day catalog lookup, not the engine's `occasionKey` machinery (see
  that package's README for why kvius-matched years make that safe).
- `@sichos-kodesh/catalog`'s bundled JSON (`src/catalog/data/`, generated
  from the real crawled dataset — 3,424 occasions, regenerate with
  `npm run build-catalog` in `packages/catalog`) backs the
  "does this occasion have real content" lookups (`hasContent` — audio
  *or* a PDF counts; a transcript with no audio is still real content,
  not a gap).
- Two ways to pick a year, both on `YearPickerScreen`: **Follow along**
  (kvius-matched years only, via `findMatchingYears`, leads to
  `ThisWeekScreen`'s list of this week's occasions) and **Browse any
  year** (every indexed year via `browsableYears`, no kvius match
  required, leads to `YearBrowserScreen`'s list of that year's occasions,
  grouped by Hebrew month — there's no "this week" to compute for a year
  with no guaranteed week/date alignment to the current one). Both
  screens are list-then-detail: tap a date to see its categories/downloads.
- `src/components/OccasionDetail.tsx` — the shared download/read card
  used by both `ThisWeekScreen` and `YearBrowserScreen`. Groups content
  into labeled categories (Audio, then each PDF section present, sorted so
  a PDF matching the user's edition preference comes first) rather than
  one flat pile of buttons.
- Real downloads through `services/media-proxy`'s `/jem-audio/:filename`
  and `/drive/:fileId` routes (`src/download/download.ts`), basic
  play/pause via `react-native-sound`, PDFs rendered directly in-app via
  `react-native-pdf` (`src/screens/PdfViewerScreen.tsx`) rather than
  handed off to the OS's own viewer - so an occasion's own recording can
  keep playing in a persistent bottom bar (`BottomAudioPlayer`) while its
  pages are scrolled through.
- A settings screen (`src/screens/SettingsScreen.tsx`) lets the user
  prefer one printed edition (Sefer HaSichos/HaMaamarim vs. Toras
  Menachem, persisted via AsyncStorage) - `OccasionDetail` puts PDFs
  matching that preference first within each category (see
  `packages/catalog`'s `classifyPdfEdition`/`sortPdfsByEditionPreference`),
  without hiding the other edition.

Deliberately not built yet (see `docs/PLANNING.md`'s Phase 3):
- Batch month/year downloads, zip bundling.
- Background/resumable downloads (`react-native-background-downloader`) —
  a single foreground download is enough for one file at a time.
- A gap-handling UI with manual overrides (a gap just shows a plain
  message right now).

## Media proxy

`src/config.ts`'s `MEDIA_PROXY_BASE_URL` points at the live deployed
Worker (`services/media-proxy`) - verified working with a real ranged
request. Redeploying that service updates the same URL in place; no
change needed here unless the Worker itself is renamed or moved.

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
npm run typecheck
npm test
npm run lint
```

`@sichos-kodesh/kvius-engine` and `@sichos-kodesh/catalog` are resolved
via their built `dist/` output, not source — `start`/`android`/`ios`/
`test`/`typecheck` all build both first automatically (`pre<script>` npm
hooks), so no separate manual build step is needed.

### Getting an APK without a full local Android setup

The CI workflows that built a debug APK on every push
(`android-apk.yml`, publishing to a floating `latest-dev-build` GitHub
Release) and a signed release `.aab` (`android-aab.yml`) are removed for
now — testing focus shifted to `apps/web`, a real installable PWA that
needs no build pipeline or sideloading at all (see that package's
README). To get an APK again: `npm run android` with a local Android
SDK/emulator/device attached, or bring back an equivalent GitHub Actions
workflow (see this file's git history for the removed ones).

## Google Play (Internal testing track)

Not currently pursued — see the note above; this section is kept for
when Android CI comes back. The plan was a signed release `.aab` (what
Play actually wants — it splits per-device at install time, so the real
download is a fraction of the debug APK's size, which bundles all four
CPU architectures unsplit), built via `workflow_dispatch`, not on every
push — a release build is deliberate, not automatic.

Needs 4 repository secrets first (Settings → Secrets and variables →
Actions): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` — generated once with:

```sh
keytool -genkeypair -v -storetype PKCS12 \
  -keystore sichos-kodesh-upload.keystore -alias sichos-kodesh-upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 sichos-kodesh-upload.keystore   # -> ANDROID_KEYSTORE_BASE64
```

**Keep that `.keystore` file somewhere safe outside this repo** (it's
gitignored — `*.keystore` except `debug.keystore` — and must never be
committed). It's the app's Play "upload key" identity; with Google Play
App Signing (recommended, required for new Play apps) Google holds the
true signing key and the upload key can be reset via Play Console if
lost, so losing it is a support-flow delay, not catastrophic — but it's
still a real credential, not something to leave lying around.

Once the workflow runs, download `app-release.aab` from the run's
artifacts and upload it manually via Play Console → your app → **Internal
testing** → Create release. This is deliberately a manual, occasional step
rather than an automated Play-publish pipeline — see `docs/PLANNING.md`'s
rights discussion for why even internal testing (real people other than
you installing it) is a bigger step than local sideloading, worth doing
deliberately rather than on every push.

For local release builds outside CI: copy
`android/keystore.properties.example` to `android/keystore.properties`
(gitignored) and fill in the real values.

### A real, non-obvious monorepo wrinkle

`android/settings.gradle`'s `includeBuild(...)` path was adjusted from
the RN CLI's default (`../node_modules/@react-native/gradle-plugin`) to
`../../../node_modules/@react-native/gradle-plugin`, because npm
workspace hoisting puts that package at the repo root, not in this app's
own `node_modules`. If `android/` is ever regenerated from a fresh CLI
template, reapply this fix (it's also commented inline in that file).
