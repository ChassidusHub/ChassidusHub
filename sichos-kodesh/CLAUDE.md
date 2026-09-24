# Sichos Kodesh

## Release APKs — only on explicit request

Never trigger CI builds on your own — not test builds, not release builds.
Only when Shmuly explicitly asks.

When he asks for a test build ("build an APK to try"), trigger the release
workflow manually with the version left empty:
`gh workflow run android-release-apk.yml --ref main`
That only builds the APKs as downloadable workflow artifacts. Do not attempt
local APK compiles.

When he explicitly asks for a tagged release (e.g. "make a tagged release v1.2.0"):

1. Confirm the version matches the app's `versionName` in
   `apps/mobile/android/app/build.gradle`.
2. Push the tag — that triggers CI:
   `git tag vX.Y.Z && git push origin vX.Y.Z`
   (Alternative: `gh workflow run android-release-apk.yml --ref main -f version=vX.Y.Z`.)
3. Wait for the run to finish — the Gradle build takes about 15 minutes.
4. CI attaches the signed APKs (`arm64-v8a`, `armeabi-v7a`, `universal`)
   and publishes the release automatically. Nothing is left as a draft and
   there is nothing for Shmuly to click.
5. Tell Shmuly when the published release is ready at
   https://github.com/shmuky/Sichos-Kodesh/releases

Notes:
- This workflow is APK-only. The Play Store AAB lives in the separate
  `android-aab.yml` workflow and is never part of a tagged phone release.
