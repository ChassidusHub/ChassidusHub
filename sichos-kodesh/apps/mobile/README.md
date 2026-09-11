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

## Before running this for real

`src/config.ts`'s `MEDIA_PROXY_BASE_URL` is a placeholder
(`https://REPLACE-ME.workers.dev`) — `services/media-proxy` has never
been deployed live (see that package's README). Either run
`wrangler deploy` from `services/media-proxy` and paste the real URL in,
or point it at a `wrangler dev` LAN address for local testing.

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

### A real, non-obvious monorepo wrinkle

`android/settings.gradle`'s `includeBuild(...)` path was adjusted from
the RN CLI's default (`../node_modules/@react-native/gradle-plugin`) to
`../../../node_modules/@react-native/gradle-plugin`, because npm
workspace hoisting puts that package at the repo root, not in this app's
own `node_modules`. If `android/` is ever regenerated from a fresh CLI
template, reapply this fix (it's also commented inline in that file).
