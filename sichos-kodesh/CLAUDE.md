# Sichos Kodesh

## Release APKs — only on explicit request

Never build or publish release APKs on your own initiative. Only when Shmuly
explicitly asks for a tagged release (e.g. "make a tagged release v1.2.0"):

1. Confirm the version matches the app's `versionName` in
   `apps/mobile/android/app/build.gradle`.
2. Make the tagged release by pushing the tag — that triggers CI:
   `git tag vX.Y.Z && git push origin vX.Y.Z`
   (Alternative: `gh workflow run android-release-apk.yml --ref main -f version=vX.Y.Z`.)
3. Wait for the run to finish — the Gradle build takes about 15 minutes.
4. The workflow creates a **draft** GitHub Release with the signed APKs
   (`arm64-v8a`, `armeabi-v7a`, `universal`) attached. Leave the draft for
   Shmuly to review and publish — do not publish it yourself unless he
   explicitly says to. Publishing the draft creates the git tag.
5. Tell Shmuly when the draft is ready at
   https://github.com/shmuky/Sichos-Kodesh/releases

Notes:
- A run with the version left empty only builds the APKs as downloadable
  workflow artifacts for testing — use that if he wants a test build first.
- This workflow is APK-only. The Play Store AAB lives in the separate
  `android-aab.yml` workflow and is never part of a tagged phone release.
