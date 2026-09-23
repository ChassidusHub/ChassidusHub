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

# Top edge of the global player bar in the last dump - its skip/seek
# controls give it away; the bar's title sits a little above them, hence the
# margin - or the screen height when no bar is showing.
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
    if attr(node, "content-desc") in ("Previous chapter", "Next chapter", "Seek"):
        b = re.search(r"\[(\d+),(\d+)\]", attr(node, "bounds"))
        if b:
            top = min(top, int(b.group(2)) - int(sys.argv[2]))
print(top)
' "$SCREEN_H" "$((SCREEN_H * 3 / 40))"
}

# Scrolls the current screen up by most of a screen height (a swipe, not a tap).
scroll_down() {
  adb shell input swipe "$((SCREEN_W / 2))" "$((SCREEN_H * 2 / 3))" "$((SCREEN_W / 2))" "$((SCREEN_H / 4))" 300
  sleep 2
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
        play|pause|"previous chapter"|"next chapter"|seek) break ;;
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
wait_text "Browse any year" && shot 01-home 3

# --- Follow flow: kvius years -> this week -> occasion -> recordings -> player
tap_text "Kvius Farbrengens" && wait_text "This week only" ; shot 02-kvius-years
tap_text "5736" || tap_text "57"
wait_text "All of" && shot 03-this-week
# Pick an occasion that has a recording, so the recordings/player steps below
# have something to exercise: the row's own "Has a recording" icon gives the
# row's vertical position; the label side of that same row is tapped.
xy="$(find_node "Has a recording")"
if [ -n "$xy" ]; then
  y="${xy#* }"
  log "tap first occasion with a recording @ 200 $y"
  adb shell input tap 200 "$y"
else
  # No recordings this week - fall back to the first occasion row.
  xy="$(dump_ui | python3 -c '
import re, sys
xml = sys.stdin.read()
def attr(node, name):
    m = re.search(name + r"=(?:\"([^\"]*)\"|\x27([^\x27]*)\x27)", node)
    return (m.group(1) or m.group(2) or "") if m else ""
for m in re.finditer(r"<node [^>]*?(?:/>|>)", xml):
    node = m.group(0)
    if "Button" in attr(node, "class") and re.search(r"[֐-׿]", attr(node, "content-desc")):
        b = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", attr(node, "bounds"))
        if b:
            x1, y1, x2, y2 = map(int, b.groups())
            if y1 > 400:
                print((x1 + x2) // 2, (y1 + y2) // 2); break
')"
  if [ -n "$xy" ]; then log "tap first occasion @ $xy"; adb shell input tap $xy; else fail "no occasion row found"; fi
fi
wait_text "This occasion, every year" && shot 04-occasion
if tap_text "Recordings"; then
  wait_text "Share" && shot 05-recordings
  # The big playlist play button; then wait for it to flip to Pause (playing) and screenshot the global player bar.
  tap_text "Play" && wait_text "Pause" && shot 06-player-playing 5
  # Second chapter, if there is one, via the player's next button.
  tap_text "Next chapter" && sleep 8 && shot 07-player-next 3
  back
fi
# A hanacha card's own Read button; an occasion with no hanacha keeps its PDFs behind a section row instead.
if ! tap_text "Read"; then
  tap_text "Mugah" || tap_text "Maamorim" || tap_text "Hagahos" || tap_text "Hosofos"
  tap_text "Read"
fi
# The file is fetched to local storage first, then rendered natively - on a
# software-emulated device that fetch alone can take a minute or two.
wait_gone "Opening file" 40 && shot 08-pdf 6
back; sleep 2
tap_text "This occasion, every year" && wait_text "across every year" && shot 09-occasion-all-years
back; back; back; back
wait_text "Browse any year"

# --- Cross-year list, browse flow
tap_text "All farbrengens this week" && wait_text "across every year" && shot 10-all-years-this-week
back
tap_text "Browse any year" && wait_text "Every year with something" && shot 11-browse-years
tap_text "5711" && wait_text "occasion" && shot 12-year-browser
back; back

# --- Search (the box needs focus first; neither the web nor the app autofocuses it)
tap_text "Search" && wait_text "Search occasions" && shot 13-search
# One character at a time: a whole word injected at once loses letters on a
# slow (software-emulated) device.
tap_text "Search occasions" && type_text "Tishrei" && sleep 4 && shot 14-search-results
# The screen's own Back link, not the hardware key - with the keyboard up that key only dismisses the keyboard.
tap_text "Back"
wait_text "Browse any year"

# --- Settings, dark mode (incl. the PDF), Hebrew
tap_text "Settings" && wait_text "Appearance" && shot 15-settings
# The phone-only Notifications section sits below the fold.
scroll_down && shot 15-settings-notifications
scroll_to_top
tap_text "Dark" && sleep 2 && shot 16-settings-dark
back; shot 17-home-dark
# The PDF read earlier, now in dark mode - inverted like the web's, and local by now so it opens at once.
if tap_text 'מוצאי י"ג תשרי'; then
  wait_text "This occasion, every year"
  if tap_text "Read"; then
    wait_gone "Opening file" 20 && shot 17-pdf-dark 6
    back
  fi
  back
fi
tap_text "Settings" && tap_text "Light" && sleep 1
tap_text "Downloads" && wait_text "Auto-download" && shot 18-download-settings
# Switch the automatic sync on (reveals the phone-only "also when closed"
# option) and kick one run off: the sync task posts the new-week notice
# within seconds and queues this week's files, whose progress shows in the
# notification shade.
tap_text "Auto-download automatically" && sleep 1 && shot 18-download-settings-auto
tap_text "Download this week now" && sleep 20
adb shell cmd statusbar expand-notifications && shot 19-notifications 3
adb shell cmd statusbar collapse; sleep 1
back
tap_text "About" && wait_text "Powered by" && shot 19-about
tap_text "Privacy Policy" && wait_text "Last updated" && shot 20-privacy
back; back
tap_text "Hebrew" && sleep 2 && shot 21-settings-hebrew
back; shot 22-home-hebrew
tap_text "הגדרות" && tap_text "English" && back

log "crash / JS error lines in logcat:"
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: .*Exception|ReactNativeJS: .*Error|JavascriptException|ANR in $PKG" | head -20 | tee "$OUT/logcat-errors.txt"
if [ -s "$OUT/logcat-errors.txt" ]; then FAILED=1; fi
adb logcat -d > "$OUT/logcat.txt"

if [ "$FAILED" -ne 0 ]; then
  echo "✗ UI walkthrough found problems - see $OUT" >&2
  exit 1
fi
echo "✓ UI walkthrough passed - screenshots in $OUT"
