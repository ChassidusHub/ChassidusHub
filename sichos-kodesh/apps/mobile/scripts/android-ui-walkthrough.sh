#!/usr/bin/env bash
# Installs an APK on the connected Android device/emulator and taps through
# every screen of the app the way a person would, screenshotting each one
# into an output directory - the "does the UI actually show up and work"
# check that a build-only smoke test can't answer.
#
# Taps are found by *text*, not coordinates: each step dumps the accessibility
# tree (`uiautomator dump`) and taps the center of the first node whose
# text/content-desc matches, so the same script works on any screen size and
# fails loudly (non-zero exit, plus a screenshot of what was actually on
# screen) when an expected label is missing.
#
# Usage: android-ui-walkthrough.sh <apk> [out-dir]
#   Needs adb on PATH and one device visible to `adb devices`. A slow
#   (software-emulated) device is fine - every wait is generous.
#   SKIP_INSTALL=1 skips the uninstall/install (the smoke test already
#   installed the app and is serving it from Metro).
set -uo pipefail
APK="${1:?usage: $0 <apk> [out-dir]}"
OUT="${2:-smoke-artifacts/ui}"
PKG=com.sichoskodeshmobile
mkdir -p "$OUT"
FAILED=0

log() { echo "▶ $*"; }
fail() { echo "✗ $*" >&2; FAILED=1; }

shot() {
  # $1 = name. Waits a moment for the frame to settle first.
  sleep "${2:-2}"
  adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null && echo "  📸 $1"
}

dump_ui() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell cat /sdcard/ui.xml 2>/dev/null
}

# The most recent accessibility dump (see refresh_ui). One dump per step -
# on a software-emulated device the dump itself is the slow part.
UI_XML=""
refresh_ui() { UI_XML="$(dump_ui)"; }

# Prints "x y" for the center of the first node in the last dump whose text
# or content-desc contains $1 (case-insensitive), or nothing. uiautomator
# single-quotes an attribute whose value contains a double quote (common in
# Hebrew labels like יו"כ), so both quote styles are read.
node_center() {
  printf '%s' "$UI_XML" | python3 -c '
import re, sys
needle = sys.argv[1].lower()
xml = sys.stdin.read()
def attr(node, name):
    m = re.search(name + r"=(?:\"([^\"]*)\"|\x27([^\x27]*)\x27)", node)
    return (m.group(1) or m.group(2) or "") if m else ""
for m in re.finditer(r"<node [^>]*?(?:/>|>)", xml):
    node = m.group(0)
    hay = (attr(node, "text") + " " + attr(node, "content-desc")).lower()
    if needle in hay:
        b = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", attr(node, "bounds"))
        if b:
            x1, y1, x2, y2 = map(int, b.groups())
            if x2 > x1 and y2 > y1:
                print((x1 + x2) // 2, (y1 + y2) // 2)
                break
' "$1"
}

# node_center from a fresh dump.
find_node() {
  refresh_ui
  node_center "$1"
}

# Top edge of the mini player in the last dump - its "Open the player"
# button gives it away, with a little margin - or the screen height when
# no player is showing.
player_bar_top() {
  printf '%s' "$UI_XML" | python3 -c '
import re, sys
xml = sys.stdin.read()
top = int(sys.argv[1])
def attr(node, name):
    m = re.search(name + r"=(?:\"([^\"]*)\"|\x27([^\x27]*)\x27)", node)
    return (m.group(1) or m.group(2) or "") if m else ""
for m in re.finditer(r"<node [^>]*?(?:/>|>)", xml):
    node = m.group(0)
    desc = attr(node, "content-desc")
    if desc.startswith("Open the player") or desc == "Show the player":
        b = re.search(r"\[(\d+),(\d+)\]", attr(node, "bounds"))
        if b:
            top = min(top, int(b.group(2)) - int(sys.argv[2]))
print(top)
' "$SCREEN_H" "$((SCREEN_H * 3 / 40))"
}

# Scrolls the current screen up by most of a screen height (a swipe, not a
# tap). A slow swipe, so the list stops where the finger stops instead of
# flinging on - a dump taken while it is still moving reports bounds the
# next tap misses by a row - and a moment for it to settle before the next
# dump.
scroll_down() {
  adb shell input swipe "$((SCREEN_W / 2))" "$((SCREEN_H * 2 / 3))" "$((SCREEN_W / 2))" "$((SCREEN_H / 4))" 900
  sleep 3
}

# Back to the top of a scrolled screen (two swipes cover any screen in the app).
scroll_to_top() {
  adb shell input swipe "$((SCREEN_W / 2))" "$((SCREEN_H / 4))" "$((SCREEN_W / 2))" "$((SCREEN_H * 3 / 4))" 300
  adb shell input swipe "$((SCREEN_W / 2))" "$((SCREEN_H / 4))" "$((SCREEN_W / 2))" "$((SCREEN_H * 3 / 4))" 300
  sleep 2
}

# Taps the first node matching $1, retrying for up to ~20s while the screen
# renders. The global player bar floats over the bottom of every screen, so
# a list item sitting behind it is scrolled clear of it first (the bar's own
# controls are tapped where they are), and a label that is not on screen at
# all - further down a long list; the dump reports it with empty bounds - is
# scrolled towards.
tap_text() {
  local needle="$1" xy="" attempt
  for attempt in $(seq 1 10); do
    refresh_ui
    xy="$(node_center "$needle")"
    if [ -n "$xy" ]; then
      case "$(printf '%s' "$needle" | tr '[:upper:]' '[:lower:]')" in
        play|pause|"previous chapter"|"next chapter"|seek|"open the player"|"close the player"|"forward 15 seconds"|"back 15 seconds") break ;;
      esac
      if [ "${xy#* }" -ge "$(player_bar_top)" ]; then
        scroll_down
        xy=""
        continue
      fi
      break
    fi
    [ "$attempt" -ge 4 ] && scroll_down
    sleep 2
  done
  if [ -z "$xy" ]; then
    fail "could not find '$needle' on screen"
    adb exec-out screencap -p > "$OUT/missing-$(echo "$needle" | tr -cs 'A-Za-z0-9' '-').png" 2>/dev/null
    return 1
  fi
  log "tap '$needle' @ $xy"
  adb shell input tap $xy
}

# Taps the tab named $1 in the tab bar: the lowest node on screen whose text
# or content-desc is exactly $1, so a link on the page that merely contains
# the word ("All farbrengens this week, every year") isn't taken for the tab.
tap_tab() {
  local xy="" _
  for _ in $(seq 1 10); do
    refresh_ui
    xy="$(printf '%s' "$UI_XML" | python3 -c '
import re, sys
needle = sys.argv[1].lower()
xml = sys.stdin.read()
def attr(node, name):
    m = re.search(name + r"=(?:\"([^\"]*)\"|\x27([^\x27]*)\x27)", node)
    return (m.group(1) or m.group(2) or "") if m else ""
best = None
for m in re.finditer(r"<node [^>]*?(?:/>|>)", xml):
    node = m.group(0)
    if needle not in (attr(node, "text").strip().lower(), attr(node, "content-desc").strip().lower()):
        continue
    b = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", attr(node, "bounds"))
    if b:
        x1, y1, x2, y2 = map(int, b.groups())
        if x2 > x1 and y2 > y1 and (best is None or y1 > best[1]):
            best = ((x1 + x2) // 2, (y1 + y2) // 2)
if best:
    print(best[0], best[1])
' "$1")"
    [ -n "$xy" ] && break
    sleep 2
  done
  if [ -z "$xy" ]; then
    fail "could not find the '$1' tab"
    adb exec-out screencap -p > "$OUT/missing-tab-$(echo "$1" | tr -cs 'A-Za-z0-9' '-').png" 2>/dev/null
    return 1
  fi
  log "tab '$1' @ $xy"
  adb shell input tap $xy
}

# Waits until a node matching $1 is on screen (up to ~40s).
wait_text() {
  for _ in $(seq 1 20); do
    [ -n "$(find_node "$1")" ] && return 0
    sleep 2
  done
  fail "'$1' never appeared"
  return 1
}

# Waits until no node matches $1 any more - a "loading" label going away -
# for up to $2 rounds of a few seconds each (default 20).
wait_gone() {
  local rounds="${2:-20}"
  for _ in $(seq 1 "$rounds"); do
    [ -z "$(find_node "$1")" ] && return 0
    sleep 3
  done
  fail "'$1' is still showing"
  return 1
}

back() { adb shell input keyevent KEYCODE_BACK; sleep 1; }

# Types $1 into the focused field one character at a time.
type_text() {
  local text="$1" i
  for ((i = 0; i < ${#text}; i++)); do
    adb shell input text "${text:i:1}"
    sleep 0.5
  done
}

if ! adb devices | grep -qE "device$"; then
  echo "✗ no Android device/emulator connected" >&2
  exit 2
fi

if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  log "installing $APK"
  adb uninstall $PKG >/dev/null 2>&1 || true
  adb install -r "$APK" | tail -1
fi
read -r SCREEN_W SCREEN_H < <(adb shell wm size | sed -E 's/.*: *([0-9]+)x([0-9]+).*/\1 \2/' | tail -1)
SCREEN_W="${SCREEN_W:-1080}"; SCREEN_H="${SCREEN_H:-2400}"
adb shell settings put global window_animation_scale 0 >/dev/null 2>&1
adb shell settings put global transition_animation_scale 0 >/dev/null 2>&1
adb shell settings put global animator_duration_scale 0 >/dev/null 2>&1
adb logcat -c

log "launching"
# Android 13+ asks for notification permission on first launch; granted up
# front so the dialog doesn't sit over the home screen (the prompt itself
# is Android's, not this app's).
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
# Always from a cold start on the home screen, even if the app was already open.
adb shell am force-stop $PKG >/dev/null 2>&1
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
# The first start asks how the app will be used (the mode chooser); online.
for _ in $(seq 1 30); do
  refresh_ui
  if [ -n "$(node_center "How will you use the app?")" ]; then
    shot 00-mode-chooser 2
    tap_text "Online"
    break
  fi
  [ -n "$(node_center "Farbrengens")" ] && break
  sleep 3
done

# This week: the tab the app opens on.
wait_text "This week" && shot 01-this-week 4
scroll_down && shot 02-this-week-more
scroll_to_top

# Farbrengens tab: by year, a year's months, a month's farbrengens, one farbrengen's page.
tap_tab "Farbrengens" && sleep 2 && shot 03-farbrengens
tap_text "5736" && wait_text "Tishrei" && shot 04-year
tap_text "Tishrei" && wait_text "6 Tishrei" && shot 05-month
tap_text "6 Tishrei" && wait_text "This occasion, every year" && shot 06-farbrengen 3

# Play: the mini player above the tabs, then the full player with its chapters and 15-second skips.
tap_text "Play" && wait_text "Open the player" && shot 07-mini-player 8
tap_text "Open the player" && wait_text "Chapters" && shot 08-full-player 3
tap_text "Forward 15 seconds" && sleep 3 && shot 09-full-player-skipped 2
tap_text "Close the player" && sleep 2

# A text: the PDF with its top bar and page slider; a tap on the page hides both, a second brings them back.
tap_text "שיחו"
wait_gone "Opening" 40 && shot 10-pdf 6
wait_text "Page 1 of" || true
adb shell input tap "$((SCREEN_W / 2))" "$((SCREEN_H / 2))" && shot 11-pdf-chrome-hidden 3
[ -n "$(find_node "Page 1 of")" ] && fail "the page slider stayed after a tap on the page"
adb shell input tap "$((SCREEN_W / 2))" "$((SCREEN_H / 2))" && sleep 2
back

tap_text "This occasion, every year" && wait_text "across every year" && shot 12-occasion-all-years
back

# Library tab: the shelf, then Igros Kodesh.
tap_tab "Library" && wait_text "The Rebbe's Torah" && shot 13-library
tap_text "Igros Kodesh" && sleep 3 && shot 14-igros
back

# Search tab: before typing, then results grouped by kind.
tap_tab "Search" && sleep 2 && shot 15-search
tap_text "A name, a date" && type_text "Tishrei" && adb shell input keyevent KEYCODE_ENTER && sleep 5 && shot 16-search-results
back

# Mine tab: Settings (dark and back), About and the privacy policy, and Hebrew.
tap_tab "Mine" && wait_text "Settings" && shot 17-mine
tap_text "Settings" && wait_text "Appearance" && shot 18-settings
tap_text "Dark" && sleep 2 && shot 19-settings-dark
back; shot 20-mine-dark
tap_text "Settings" && tap_text "Light" && sleep 1
back
tap_text "About" && wait_text "Powered by" && shot 21-about
tap_text "Privacy Policy" && wait_text "Last updated" && shot 22-privacy
back; back
# The language switch names each language in its own: English, עברית.
tap_text "Settings" && tap_text "עברית" && sleep 2 && shot 23-settings-hebrew
back; shot 24-mine-hebrew
tap_tab "השבוע" && sleep 3 && shot 25-this-week-hebrew
# The search box before typing: the Hebrew hint set right to left.
tap_tab "חיפוש" && sleep 2 && shot 26-search-hebrew
tap_tab "שלי" && tap_text "הגדרות" && tap_text "English" && back

log "crash / JS error lines in logcat:"
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: .*Exception|ReactNativeJS: .*Error|JavascriptException|ANR in $PKG" | head -20 | tee "$OUT/logcat-errors.txt"
if [ -s "$OUT/logcat-errors.txt" ]; then FAILED=1; fi
adb logcat -d > "$OUT/logcat.txt"

if [ "$FAILED" -ne 0 ]; then
  echo "✗ UI walkthrough found problems - see $OUT" >&2
  exit 1
fi
echo "✓ UI walkthrough passed - screenshots in $OUT"
