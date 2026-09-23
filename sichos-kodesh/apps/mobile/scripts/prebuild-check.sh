#!/usr/bin/env bash
# Gate that runs before every Android build (`npm run android:release`,
# `android:assembleDebug`, and the release/AAB workflows): if anything here
# fails, no APK is produced. Everything is deterministic and needs no device.
#
#   1. Rebuild the workspace packages the app imports.
#   2. Re-apply the react-native-track-player source patch (see
#      scripts/patch-react-native-track-player.mjs) - a fresh `npm ci` runs
#      it too, but a stale node_modules must never reach a build.
#   3. The bundled UI fonts must be present (a missing font silently falls
#      back to Roboto on the device).
#   4. No emoji in UI source - every glyph comes from lucide-react-native.
#   5. Typecheck, lint, unit tests.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd ../.. && pwd)"

echo "▶ workspace packages"
(cd "$ROOT" && npm run build -w @sichos-kodesh/kvius-engine -w @sichos-kodesh/catalog -w @sichos-kodesh/app-core >/dev/null)

echo "▶ react-native-track-player patch"
(cd "$ROOT" && node scripts/patch-react-native-track-player.mjs)

echo "▶ bundled fonts"
for font in NotoSans.ttf NotoSans_bold.ttf; do
  if [ ! -s "android/app/src/main/assets/fonts/$font" ]; then
    echo "✗ missing android/app/src/main/assets/fonts/$font" >&2
    exit 1
  fi
done

echo "▶ no emoji in UI source"
# Emoji & pictograph blocks (Misc Symbols, Dingbats, and the Supplemental
# Symbols/Emoticons planes). Translations are exempt: they are content, not chrome.
python3 - <<'PY'
import pathlib, re, sys
emoji = re.compile("[☀-➿\U0001F300-\U0001FAFF]")
bad = []
for path in [*pathlib.Path("src").rglob("*.ts"), *pathlib.Path("src").rglob("*.tsx"), pathlib.Path("App.tsx")]:
    if path.as_posix() == "src/i18n/translations.ts":
        continue
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if emoji.search(line):
            bad.append(f"{path}:{number}: {line.strip()}")
if bad:
    print("\n".join(bad))
    print("✗ emoji found in UI source - use a lucide-react-native icon instead", file=sys.stderr)
    sys.exit(1)
PY

echo "▶ typecheck"
npx tsc --noEmit

echo "▶ lint"
npx eslint .

echo "▶ unit tests"
npx jest --silent

echo "✓ prebuild checks passed"
