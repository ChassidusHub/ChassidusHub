# @sichos-kodesh/catalog-api

`https://api.sk.chassidushub.org` - the catalog release both apps fetch on
their own (see `packages/catalog/README.md`, "Catalog releases"). One
Cloudflare Worker on the chassidushub.org account, no storage: the files
it serves are generated from this repository's own catalog when the Worker
is built. Texts and app updates it passes on (below).

## Endpoints

All plain JSON, `GET`/`HEAD`/`OPTIONS`, `Access-Control-Allow-Origin: *`.
The shapes are `CatalogManifest` / `CatalogRelease` in
`packages/catalog/src/release.ts`; the client is
`packages/app-core/src/catalog/catalogUpdate.ts`.

| Path | What | Cache-Control |
| --- | --- | --- |
| `/v1/catalog/manifest.json` | the served release: `version`, `releasedAt`, `url`, `bytes`, `sha256`, `years`, `occasions`, `changelog` | `public, max-age=300` |
| `/v1/catalog/<version>/catalog.json` | that release's data (`byYear`), ~2.6 MB, byte-exact (`sha256` in the manifest, also the `ETag`) | `public, max-age=31536000, immutable` |
| `/v1/catalog/changelog.json` | the changelog array alone | `public, max-age=300` |
| `/v1/catalog/latest/catalog.json` | `302` to the served version | `public, max-age=300` |
| `/v2/catalog/manifest.json` | schema 2 - the phone app: the same fields plus `collections` (items per library collection) | `public, max-age=300` |
| `/v2/catalog/<version>/catalog.json` | the same farbrengens as `/v1/`, byte for byte, plus `library` (`LibraryRelease`) | `public, max-age=31536000, immutable` |
| `/v2/catalog/changelog.json`, `/v2/catalog/latest/catalog.json` | as under `/v1/` | |
| `/v3/catalog/manifest.json` | schema 3 - the phone app from mobile 1.5.0: schema 2's fields plus `works` (how many works, and how many units the imported ones have) | `public, max-age=300` |
| `/v3/catalog/<version>/catalog.json` | schema 2's file, byte for byte, plus `works` (`WorksRelease`) | `public, max-age=31536000, immutable` |
| `/v3/catalog/changelog.json`, `/v3/catalog/latest/catalog.json` | as under `/v1/` | |
| `/v3/texts/<sha256>` | a text object the works name for a source other than Sefaria (the Igros' letters): ChassidusHub keeps them (`/v1/app/v3/texts/<sha256>` on its API, over the `CHASSIDUSHUB_API` service binding); the Worker serves them with the headers the apps have always had (HTML, CORS, a strict CSP) | `public, max-age=86400, s-maxage=31536000` |
| `/v1/app/android/latest.json` | the phone app's newest release (`LatestAppRelease` in `packages/app-core/src/appRelease/appRelease.ts`): version, versionCode, the changelog entry and each APK's size and sha256. Passed through from the app server (the pack API Worker, whose R2 bucket the release workflow uploads to) over the `PACK_API` service binding | `public, max-age=300` |
| `/v1/app/android/download/<abi>` | that release's APK, passed through from the app server (`Range` kept): `arm64-v8a`, `armeabi-v7a` or `universal`. The link stays, each release replaces what it serves | |
| `/` | a small index | |
| `/robots.txt` | keeps crawlers out | |

Any other path, and any other version than the one served, is a JSON
`404` (`{"error":"not_found", ...}`); other methods a JSON `405`. The
manifest's `url` is rewritten to the origin the request arrived on, so a
preview's manifest (workers.dev, `wrangler dev`) points at its own catalog.

The web app reads `/v1/` (catalog schema 1). Phones up to mobile 1.4.0
read `/v2/` (schema 2, with the library), and from 1.5.0 `/v3/` (schema 3,
with the works too). An app never takes another schema.

The bundle keeps one copy of each part. `scripts/build.mjs` bakes the
farbrengens', the library's and the works' JSON and each file's short
head, and checks that every file reassembles to its manifest's sha256. The
router puts each catalog.json back together.

## How the API gets the files

There is no upload step. `scripts/build.mjs` (the Worker's build command,
`wrangler.toml`) runs `npm run release-files -w @sichos-kodesh/catalog`,
which writes `catalog.json` + `manifest.json` from the year files the apps
bundle, stamped with `CATALOG_VERSION` and the deployed commit's date (the
build time when no git metadata is around), and bakes both into
`generated/release.ts`; `src/worker.ts` serves those strings' exact UTF-8
bytes through the router. So the release the API serves is **the catalog
of the commit deployed** - `main`:

1. Rebuild the data and bump `CATALOG_VERSION` + the changelog
   (`packages/catalog/README.md` has the routine).
2. Merge to `main` and deploy this Worker; the apps see the new version on
   their next daily check.
3. Tag the same commit `sk-catalog-v<version>` and push the tag - the
   `sk-catalog-release` workflow attaches the identical files to a GitHub
   release, the archive of what the API served.

The texts are not in this repository (it lives inside ChassidusHub, which
keeps none in git). `packages/igros-index`'s `import-igros` writes them
locally (git-ignored), `sk-archive` puts them in the archive, and
ChassidusHub copies each one into its own storage the first time it is
asked for and serves it from there.

`main` must therefore never carry a half-bumped catalog: `release-files
--check` (run by the build) fails when the changelog's first entry is not
for `CATALOG_VERSION`.

## Deploying

The Worker `sichos-kodesh-catalog-api` on the chassidushub.org account,
with the custom domain `api.sk.chassidushub.org` (`wrangler.toml`; the
zone is on the same account, so Cloudflare makes the DNS record and the
certificate). Deploy from `sichos-kodesh/` after `npm ci`:

```
npm run deploy -w @sichos-kodesh/catalog-api   # builds generated/release.ts, then wrangler deploy
```

or connect it to Workers Builds as ChassidusHub's own Workers are
(docs/deploy.md at the repository root).
The `chassidushub-api` and `sichos-kodesh-pack-api` Workers must be on
the same account for the service bindings. The bundle is about 2.4 MB
gzipped, within the Workers Paid plan's 10 MB.

## Developing

```
npm run build -w @sichos-kodesh/catalog-api   # generates generated/release.ts
npm test -w @sichos-kodesh/catalog-api        # router and Worker tests: shapes, headers, sha256 round-trip, 404/405/OPTIONS, texts, app updates
npm run dev -w @sichos-kodesh/catalog-api     # wrangler dev; texts and app updates go to the public addresses
```

`generated/` is build output and git-ignored.
