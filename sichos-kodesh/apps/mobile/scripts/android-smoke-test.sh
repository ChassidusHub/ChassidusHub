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
PACKAGE_NAME="com.sichoskodeshmobile"

mkdir -p "$ARTIFACTS_DIR"

echo "▶ Building shared packages..."
cd "$ROOT_DIR"
npm run build -w @sichos-kodesh/kvius-engine -w @sichos-kodesh/catalog -w @sichos-kodesh/app-core

echo "▶ Running mobile checks..."
npm run test -w @sichos-kodesh/mobile
npm run typecheck -w @sichos-kodesh/mobile
npm run lint -w @sichos-kodesh/mobile

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
  echo "  To trigger CI smoke: gh workflow run mobile-android-smoke.yml"
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

echo "✓ Android smoke test PASSED: app installed and launched without fatal errors."
