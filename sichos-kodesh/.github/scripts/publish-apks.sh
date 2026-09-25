#!/usr/bin/env bash
# Puts a release's APKs on the app server and makes them the newest:
# the pack API Worker stores them in R2 (the same bucket as the packs),
# writes latest.json and removes the older version. The phones ask it for
# updates, the download site and the station link to it - api.sk.shmuky.dev
# passes both through. Nothing is downloaded from GitHub.
#
#   .github/scripts/publish-apks.sh <version> <dir with the APKs> <notes.json>
#
# Runs in the release workflow only: the Worker lets in a GitHub Actions
# OIDC token of this repository's android-release-apk.yml (the job needs
# `permissions: id-token: write`), so there is no secret to keep.
# notes.json is `npm run --silent release-notes -w @sichos-kodesh/mobile -- --json`.
set -euo pipefail

version="$1"
dir="$2"
notes="$3"
server="${SK_APP_SERVER:-https://sichos-kodesh-pack-api.shmuky.workers.dev}"
audience="sichos-kodesh-app-release"

if [ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
  echo "::error::No OIDC token: the job needs 'permissions: id-token: write'."
  exit 1
fi

# A fresh token for each request: they live a few minutes.
token() {
  curl -fsS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=$audience" | jq -r .value
}

for abi in arm64-v8a armeabi-v7a universal; do
  file="$dir/sichos-kodesh-$version-$abi.apk"
  test -f "$file"
  sha=$(sha256sum "$file" | cut -d' ' -f1)
  echo "Uploading $(basename "$file") ($(stat -c %s "$file") bytes, sha256 $sha)"
  curl -sS --fail-with-body --retry 3 --retry-all-errors -X PUT \
    -H "Authorization: Bearer $(token)" \
    -H "X-SK-Sha256: $sha" \
    -H "Content-Type: application/vnd.android.package-archive" \
    --data-binary @"$file" \
    "$server/v1/app/android/upload/$version/$abi"
  echo
done

versionCode=$(sed -n 's/^ *versionCode \([0-9]*\)/\1/p' apps/mobile/android/app/build.gradle | head -1)
jq --argjson versionCode "$versionCode" '. + {versionCode: $versionCode}' "$notes" > "$RUNNER_TEMP/publish.json"
echo "Publishing $version (versionCode $versionCode)"
curl -sS --fail-with-body --retry 3 --retry-all-errors -X POST \
  -H "Authorization: Bearer $(token)" \
  -H "Content-Type: application/json" \
  --data-binary @"$RUNNER_TEMP/publish.json" \
  "$server/v1/app/android/publish" | jq '{version, versionCode, files: [.files[] | {abi, bytes}], removed}'
echo "The app server now offers $version: https://api.sk.shmuky.dev/v1/app/android/latest.json"
