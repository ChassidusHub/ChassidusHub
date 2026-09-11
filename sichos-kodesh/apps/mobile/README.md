# @sichos-kodesh/mobile

A thin, end-to-end proof of the whole pipeline: pick a kvius-matched
Hebrew year, see this week's (or an imminent fixed-date occasion's)
matched content, download it, and play/read it fully offline. See
`docs/PLANNING.md`'s "Mobile App & Offline Downloads" section for the
full architecture context and what's deliberately deferred to later
phases.

Bare React Native CLI, **not Expo** — a plain Gradle Android project that
produces a real installable APK, no Expo/EAS account needed.

## What's real here vs. deliberately deferred

Built and working:
- `@sichos-kodesh/kvius-engine` runs on-device to compute the matched
  schedule (`src/engine/resolveThisWeek.ts`).
- `@sichos-kodesh/catalog`'s bundled JSON (`src/catalog/data/`, generated
  from the real crawled dataset — 3,424 occasions, regenerate with
  `npm run build-catalog` in `packages/catalog`) backs the
  "does this occasion have a recording" lookups.
- Real downloads through `services/media-proxy`'s `/jem-audio/:filename`
  and `/drive/:fileId` routes (`src/download/download.ts`), basic
  play/pause via `react-native-sound`, PDFs opened through the OS's own
  viewer via an Android `ACTION_VIEW` intent (`src/download/openPdf.ts`)
  — no bundled PDF renderer.

Deliberately not built yet (see `docs/PLANNING.md`'s Phase 3):
- Batch month/year downloads, zip bundling.
- Background/resumable downloads (`react-native-background-downloader`) —
  a single foreground download is enough for one file at a time.
- A gap-handling UI with manual overrides (a gap just shows a plain
  message right now).
- Only one occasion is shown at a time (an imminent fixed-date occasion
  takes priority over the regular Shabbos schedule within a 7-day
  lookahead) — a list view is real, straightforward follow-up work.

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
npm run build --workspace=@sichos-kodesh/kvius-engine
npm run build --workspace=@sichos-kodesh/mafteiach-index
npm run build --workspace=@sichos-kodesh/catalog
```

Then, from `apps/mobile`:

```sh
npm start                         # Metro
npm run android                   # needs an Android SDK/emulator/device attached
npm run typecheck
npm test
npm run lint
```

### Getting an APK without a full local Android setup

`.github/workflows/android-apk.yml` builds a debug APK on every push and
publishes it to a floating **`latest-dev-build`** GitHub Release — one
stable link, always the newest build. Download the APK from there and
sideload it (enable "install from unknown sources" for your browser or
file manager first) rather than setting up the full Android SDK locally.

## Google Play (Internal testing track)

`.github/workflows/android-aab.yml` builds a signed release `.aab` (what
Play actually wants — it splits per-device at install time, so the real
download is a fraction of the debug APK's size, which bundles all four
CPU architectures unsplit). Manually triggered (`workflow_dispatch`), not
run on every push — a release build is deliberate, not automatic.

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
