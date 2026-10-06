# @chassidushub-reader/catalog-api

The reader app's own catalog release (see `packages/catalog/README.md`,
"Catalog releases"). One Cloudflare Worker on the chassidushub.org account,
no storage and no address of its own: the files it serves are generated from
this repository's own catalog when the Worker is built. The apps ask
ChassidusHub's API (`https://api.chassidushub.org/v1/app`), which passes
their catalog requests on here over a service binding while its own release
lacks a part the apps show, and serves the texts and the app's updates
itself (`services/api/src/appCatalog.ts` at the repository root).

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
`wrangler.toml`) runs `npm run release-files -w @chassidushub-reader/catalog`,
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
3. Tag the same commit `reader-catalog-v<version>` and push the tag - the
   `reader-catalog-release` workflow attaches the identical files to a GitHub
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

The Worker `chassidushub-reader-catalog` on the chassidushub.org account
(`wrangler.toml`), with no route: ChassidusHub's API reaches it over its
`READER_CATALOG` service binding, so deploy this Worker before the API.
Deploy from `reader/` after `npm ci`:

```
npm run deploy -w @chassidushub-reader/catalog-api   # builds generated/release.ts, then wrangler deploy
```

or connect it to Workers Builds as ChassidusHub's own Workers are
(docs/deploy.md at the repository root). The bundle is about 2.4 MB
gzipped, within the Workers Paid plan's 10 MB.

## Developing

```
npm run build -w @chassidushub-reader/catalog-api   # generates generated/release.ts
npm test -w @chassidushub-reader/catalog-api        # router and Worker tests: shapes, headers, sha256 round-trip, 404/405/OPTIONS
npm run dev -w @chassidushub-reader/catalog-api     # wrangler dev
```

`generated/` is build output and git-ignored.
