# @sichos-kodesh/pack-api

The pack API (`docs/offline-plan.md`, WP5). It is a Cloudflare Worker
over R2 that serves the published archive, and it streams a signed pack
for any selection.

| Route | What it returns |
| --- | --- |
| `GET /v1/meta` | What is published: catalog version, years, audio profiles, `objects.json`'s stamp |
| `GET /v1/catalog/<year>` | That year's farbrengens, for the download site's pickers |
| `GET /v1/library/<collection>` | A library collection's items and browse axes (volume, year, moed, ...), for the same |
| `GET /v1/works` | The seforim that can join a pack, bundled by author |
| `GET /v1/objects.json` | The objects index: the trust anchor for loose files on the phone |
| `GET /v1/packs/index.json`, `/v1/packs/<file>` | The prebuilt packs |
| `GET /v1/size?scope=&profile=&sections=&maxMb=` | The exact bytes, occasions and parts of a selection |
| `GET /v1/build?…&part=N` | That selection (or one part of it) as a signed `.skpack`, streamed |
| `GET /v1/app/android/latest.json` | The phone app's newest release: version, versionCode, notes, each APK's size and sha256 |
| `GET /v1/app/android/download/<abi>` | Its APK: `arm64-v8a`, `armeabi-v7a` or `universal` (Range requests too) |
| `PUT /v1/app/android/upload/<version>/<abi>`, `POST /v1/app/android/publish` | The release workflow's upload, then the switch to the new version |

`scope` and `sections` read exactly as in `sk-pack build` (pack-format's
`parseScope` and `parseSections`). A `scope` can also name the library:
a whole collection (`reshimos`) or one group of one of its browse axes
(`likkuteiSichos:volume:12`, `maamorim:year:5711`; pack-format's
`library.ts`). Such a pack holds every PDF of its items and their
recordings in `profile`, and `sections` does not apply.

`scope` is a comma list in any mix - the download site's cart:
farbrengens years or months (`5736-01,5740-01` is the same month of two
years, `parseScopeList`) and library scopes, all in one pack. `works`
adds seforim to any pack: bundle ids from `/v1/works`, work ids, or
`all`. Their entries and objects are exactly what their own text packs
hold. With `works`, `scope` may be left out, for the seforim alone. A
file two parts of the cart share (a maamar's PDF that is also a
farbrengen's) goes in once. A mix is named after its parts ("Tishrei
5736 + Maamorim, 5711"), under the first part's collection. The plan is also the same:
`sizeSelection`, then `splitEntries`, then `composeManifests`. So a
pack from the API is the same pack `sk-pack` writes.

A build reads nothing beyond the selection:

- the year's catalog;
- the year's index shard;
- the objects themselves.

It streams every object behind a local header written from the size and
CRC-32 recorded at publish time, so `Content-Length` is exact before the
first byte. An object that arrives short errors the stream rather than
sending a broken pack. The URL is the selection, and a build is dated to
the publish time, so a CDN can cache every build as-is.

## The app's releases

The release workflow (`.github/workflows/android-release-apk.yml`, then
`.github/scripts/publish-apks.sh`) uploads each APK to
`app/android/<version>/` in the same bucket and publishes it, which
writes `app/android/latest.json` and deletes every older version: the
download links stay, what they serve moves on. The upload and the
publish take a GitHub Actions OIDC token (`src/oidc.ts`): GitHub's
signature, this repository, the release workflow, from a version tag or
main - so there is no secret to keep. A tag's run publishes its own
version only, and nothing older than what is out. `api.sk.shmuky.dev`
passes `latest.json` through and redirects the downloads here; the phone
asks it for updates (app-core's `appRelease.ts`).

## Deploying

```
sk-pack publish                                    # <archive>/published, the layout in src/layout.ts
rclone sync <archive>/published r2:sichos-kodesh-archive
wrangler secret put PACK_SIGNING_KEY               # the JSON of <archive>/keys/pack-signing.json
wrangler deploy
```

This needs:

- a Cloudflare account with R2;
- the real signing key (`sk-pack keygen`). Without it, `sk-pack serve
  --unsigned` still works for local testing.

`sk-pack serve` runs this same handler on a published directory, for
local development and for a server with no cloud at all.

## Scripts

```
npm test -w @sichos-kodesh/pack-api        # in-memory store; streams, parses and verifies packs
npm run typecheck -w @sichos-kodesh/pack-api
npx wrangler deploy --dry-run              # bundles the Worker (about 95 KB gzipped)
```
