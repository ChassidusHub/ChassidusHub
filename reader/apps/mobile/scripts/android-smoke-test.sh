#!/usr/bin/env bash
# Android smoke-test / build-verification script.
#
# Usage:
#   bash scripts/android-smoke-test.sh            # full smoke (requires adb device)
#   bash scripts/android-smoke-test.sh --build-only  # APK build only, no device needed
#
# Exit codes:
#   0  pass
#   1  failure (build or crash)
#   2  skip — no emulator/device connected (non-build-only mode)
#
# Artifacts are written to apps/mobile/smoke-artifacts/

set -euo pipefail

BUILD_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--build-only" ]] && BUILD_ONLY=true
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
ANDROID_DIR="$MOBILE_DIR/android"
ARTIFACTS_DIR="$MOBILE_DIR/smoke-artifacts"
PACKAGE_NAME="org.chassidushub.app"

mkdir -p "$ARTIFACTS_DIR"

echo "▶ Pre-build checks (shared packages, track-player patch, fonts, no emoji, typecheck, lint, tests)..."
cd "$ROOT_DIR"
npm run prebuild:check -w @chassidushub-reader/mobile

# A debug APK never bundles JS (it loads it from Metro at runtime), so an
# assembleDebug pass says nothing about whether the app's JS resolves at all.
echo "▶ Bundling release JS (catches module-resolution failures without a device)..."
cd "$MOBILE_DIR"
BUNDLE_DIR="$(mktemp -d)"
if ! npx react-native bundle --platform android --dev false --entry-file index.js \
    --bundle-output "$BUNDLE_DIR/index.android.bundle" --assets-dest "$BUNDLE_DIR/res" \
    > "$ARTIFACTS_DIR/js-bundle.log" 2>&1; then
  tail -40 "$ARTIFACTS_DIR/js-bundle.log" >&2
  echo "✗ JS bundle failed. See $ARTIFACTS_DIR/js-bundle.log" >&2
  exit 1
fi
rm -rf "$BUNDLE_DIR"
echo "✓ JS bundle built."

echo "▶ Building debug APK (x86_64 only to stay within runner disk limits)..."
cd "$ANDROID_DIR"
set +o pipefail
./gradlew assembleDebug -PreactNativeArchitectures=x86_64 2>&1 | tee "$ARTIFACTS_DIR/gradle-build.log"
GRADLE_RC=${PIPESTATUS[0]}
set -o pipefail
if [[ $GRADLE_RC -ne 0 ]]; then
  echo "✗ Gradle build failed (exit $GRADLE_RC). See $ARTIFACTS_DIR/gradle-build.log" >&2
  exit "$GRADLE_RC"
fi

# Locate the APK: -PreactNativeArchitectures=x86_64 keeps the standard output path
# but guard against missing directory so set -e never triggers silently.
APK_DIR="$ANDROID_DIR/app/build/outputs/apk/debug"
APK=""
if [[ -d "$APK_DIR" ]]; then
  APK="$(find "$APK_DIR" -name "*.apk" -print -quit 2>/dev/null)"
fi

if [[ -z "$APK" ]]; then
  echo "✗ No APK found under $APK_DIR after build." >&2
  echo "  Contents of $ANDROID_DIR/app/build/outputs:" >&2
  find "$ANDROID_DIR/app/build/outputs" -maxdepth 4 -type f 2>/dev/null | head -20 || echo "  (directory missing)" >&2
  exit 1
fi

echo "✓ APK built: $APK"

if [[ "$BUILD_ONLY" == "true" ]]; then
  echo "✓ Build-only smoke test passed."
  exit 0
fi

echo "▶ Checking for connected emulator/device..."
DEVICE_COUNT="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" { count++ } END { print count+0 }')"
if [[ "$DEVICE_COUNT" -lt 1 ]]; then
  echo "⚠ No Android emulator/device connected — skipping runtime smoke (exit 2)."
  echo "  Start an emulator or connect a device, then re-run without --build-only."
  exit 2
fi

echo "▶ Installing APK..."
adb install -r "$APK"

echo "▶ Starting Metro..."
cd "$MOBILE_DIR"
npx react-native start --reset-cache > "$ARTIFACTS_DIR/metro-smoke.log" 2>&1 &
METRO_PID=$!
cleanup() { kill "$METRO_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Poll Metro until ready (max 60 s)
METRO_UP=false
for i in $(seq 1 12); do
  sleep 5
  if curl -sf http://localhost:8081/status > /dev/null 2>&1; then
    METRO_UP=true
    break
  fi
  echo "  Waiting for Metro... (${i}/12)"
done
if [[ "$METRO_UP" != "true" ]]; then
  echo "✗ Metro did not come up within 60 s — check $ARTIFACTS_DIR/metro-smoke.log" >&2
  exit 1
fi
echo "✓ Metro is up."

# Metro being up doesn't mean it can build the app - a resolution error only
# shows as a red box on the device, which the logcat checks below never see.
echo "▶ Requesting the app bundle from Metro..."
if ! curl -sf --max-time 300 -o /dev/null \
    "http://localhost:8081/index.bundle?platform=android&dev=true&minify=false"; then
  tail -40 "$ARTIFACTS_DIR/metro-smoke.log" >&2
  echo "✗ Smoke test FAILED: Metro could not build the app bundle." >&2
  exit 1
fi
echo "✓ Metro served the bundle."

echo "▶ Launching app..."
adb shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1

echo "▶ Waiting for app startup (20 s)..."
sleep 20

echo "▶ Collecting logcat..."
adb logcat -d > "$ARTIFACTS_DIR/android-smoke-logcat.log"

echo "▶ Capturing screenshot..."
adb exec-out screencap -p > "$ARTIFACTS_DIR/android-smoke-screenshot.png" || true

# Check for crashes
if grep -E "FATAL EXCEPTION|E/AndroidRuntime:|ReactNativeJS.*Error" \
     "$ARTIFACTS_DIR/android-smoke-logcat.log" -A 10 | head -30; then
  echo "✗ Smoke test FAILED: crash/error found in logcat." >&2
  exit 1
fi

# Check app process is still alive
if ! adb shell "ps -A | grep $PACKAGE_NAME" > /dev/null 2>&1; then
  echo "✗ Smoke test FAILED: app process not found after launch." >&2
  exit 1
fi

echo "✓ App installed and launched without fatal errors."

# A launch that stays alive says nothing about whether the screens actually
# render and respond - tap through every one of them (see the walkthrough
# script for the sequence) and keep the screenshots as artifacts. The app is
# already installed and running against Metro, so the walkthrough skips its
# own install step.
echo "▶ Walking through every screen..."
SKIP_INSTALL=1 bash "$MOBILE_DIR/scripts/android-ui-walkthrough.sh" "$APK" "$ARTIFACTS_DIR/ui"

echo "✓ Android smoke test PASSED: app launched and every screen rendered."
