# The ChassidusHub reader app

Formerly Sichos Kodesh (com.sichoskodeshmobile); since 3.0.0 the ChassidusHub app,
`org.chassidushub.app` (docs/plans/reader-app.md at the repository root).

## Merging

- Web updates merge right away, and every web release gets a version
  number (`apps/web`'s version).
- Android updates wait: do not merge or release them until a proper
  release - version bump, tag, and the APKs published per the release
  rules below. A PR that mixes the two merges its web part now and keeps
  its Android part for the release.

## Builds and releases

Local builds: you may build, compile, and test the app locally at any time
without asking.

CI builds: never trigger CI builds on your own — not test builds, not
releases — unless Shmuly explicitly asks, with one exception: when you
finish a major feature or function, you may ship it yourself (see below).

The Android emulator tests (`android:smoke`, `android:ui-walkthrough`) run
locally only, when needed. Never run them in CI, and never add a CI
workflow for them.

When he asks for a test build ("build an APK to try"), trigger the release
workflow manually with the version left empty:
`gh workflow run reader-android-release-apk.yml --ref main`
That only builds the APKs as downloadable workflow artifacts.

When he explicitly asks for a tagged release (e.g. "make a tagged release 3.1.0").
The app lives in ChassidusHub/ChassidusHub under reader/, so its tags carry a
reader- prefix (reader-v3.1.0); the plain v-tags are ChassidusHub's:

1. Confirm the version matches the app's `versionName` in
   `apps/mobile/android/app/build.gradle`.
2. Push the tag — that triggers CI:
   `git tag reader-vX.Y.Z && git push origin reader-vX.Y.Z`
   (Alternative: `gh workflow run reader-android-release-apk.yml --ref main -f version=reader-vX.Y.Z`.)
3. Wait for the run to finish — the Gradle build takes about 15 minutes.
4. CI attaches the signed APKs (`arm64-v8a`, `armeabi-v7a`, `universal`)
   and publishes the release automatically. Nothing is left as a draft.
5. Tell Shmuly it's ready, with the release tag as a clickable link:
   [reader-vX.Y.Z](https://github.com/ChassidusHub/ChassidusHub/releases/tag/reader-vX.Y.Z)

Shipping a finished major feature yourself: when a major feature or function
is done, you don't need to ask — bump `versionName` (and `versionCode`) in
`apps/mobile/android/app/build.gradle`, merge your work to main, push the
tag `reader-vX.Y.Z`, and let CI build and publish the release. Then tell Shmuly
it's live, with the release tag as a clickable link:
[reader-vX.Y.Z](https://github.com/ChassidusHub/ChassidusHub/releases/tag/reader-vX.Y.Z)

Notes:
- There is no Play Store version: the release workflow's APKs are the app,
  offered at app.chassidushub.org/get and by the app's own update prompt.
