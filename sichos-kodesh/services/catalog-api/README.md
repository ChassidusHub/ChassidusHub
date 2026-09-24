# @sichos-kodesh/catalog-api

`https://api.sk.shmuky.dev` - the catalog release both apps fetch on their
own (see `packages/catalog/README.md`, "Catalog releases"). One Vercel
function, no storage: the two files it serves are generated from this
repository's own catalog when Vercel builds the deployment.

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
| `/v3/texts/<sha256>` | a text object the works name for a source other than Sefaria (the Igros' letters): static files written by `scripts/build.mjs` from `texts/`, with the headers `vercel.json` gives them (HTML, CORS, a strict CSP) | `public, max-age=86400, s-maxage=31536000` |
| `/` | a small index | |

Any other path, and any other version than the one served, is a JSON
`404` (`{"error":"not_found", ...}`); other methods a JSON `405`. The
manifest's `url` is rewritten to the origin the request arrived on, so a
preview deployment's manifest points at that preview's own catalog.

The web app reads `/v1/` (catalog schema 1). Phones up to mobile 1.4.0
read `/v2/` (schema 2, with the library), and from 1.5.0 `/v3/` (schema 3,
with the works too). An app never takes another schema.

The bundle keeps one copy of each part. `scripts/build.mjs` bakes the
farbrengens', the library's and the works' JSON and each file's short
head, and checks that every file reassembles to its manifest's sha256. The
router puts each catalog.json back together.

## How the API gets the files

There is no upload step. `scripts/build.mjs` (the Vercel build command)
runs `npm run release-files -w @sichos-kodesh/catalog`, which writes
`catalog.json` + `manifest.json` from the year files the apps bundle,
stamped with `CATALOG_VERSION` and the deployed commit's date (the build
time when no git metadata is around), and bakes both into
`generated/release.ts`; `src/handler.ts` (bundled to `api/index.js` by the
build) serves those strings' exact UTF-8 bytes. So the release the API serves is **the catalog of the
commit deployed to production** - `main`:

1. Rebuild the data and bump `CATALOG_VERSION` + the changelog
   (`packages/catalog/README.md` has the routine).
2. Merge to `main`. Vercel builds and deploys this service; the apps see
   the new version on their next daily check.
3. Tag the same commit `catalog-v<version>` and push the tag - the
   `catalog-release` workflow attaches the identical two files to a GitHub
   release, the archive of what the API served.

The hosted texts come the same way: `texts/<work>/*.json` are committed
bundles of text objects (`{texts: [html, ...]}`, written by
`packages/igros-index`'s `import-igros`), and the build writes each to
`public/v3/texts/<sha256>`. It fails when a text the works name for a
source other than Sefaria is missing, so a sefer is never deployed that
cannot be read. `npm run dev` serves them from disk too.

`main` must therefore never carry a half-bumped catalog: `release-files
--check` (run by the build) fails when the changelog's first entry is not
for `CATALOG_VERSION`.

## Deploying

The Vercel project `sichos-kodesh-catalog-api` (team `delta-capital`,
`prj_nRJopssfuqjFZUqqSF9XL6mHdFQQ`) has root directory
`services/catalog-api` and is connected to this repository: pushes to
`main` deploy production, every other branch a preview. Nothing to run by
hand.
`api/index.js` is a committed bundle (built by `npm run build` from
`src/handler.ts`, the router, and the generated release data). Vercel only
discovers function entrypoints that exist in the source tree, so the bundle
must be committed - a build-time-only `api/index.js` is never picked up
(the API 404s without it). The `catalog-api-bundle` workflow rebuilds and
commits the bundle on every push to `main` touching `services/catalog-api`
or the catalog packages, so merging source changes is enough. Everything the build needs is in `vercel.json` and `package.json`,
so the dashboard holds no build settings:

- Framework none; build `npm run build` (`scripts/build.mjs`); output
  directory `public` (just `robots.txt` - the function answers every
  path); install runs at the repository root, as for `apps/web`.
- Node.js 24 (`engines`).
- Domain `api.sk.shmuky.dev` on the project, and at the DNS host of
  `shmuky.dev` the record `CNAME api.sk -> cname.vercel-dns.com` (the
  domain is verified on the Vercel team, but its nameservers are the
  registrar's, so the record is added there by hand; the dashboard shows
  the exact value it wants when the domain is added).

## Developing

```
npm run build -w @sichos-kodesh/catalog-api   # generates generated/release.ts, bundles api/index.js
npm test -w @sichos-kodesh/catalog-api        # router tests: shapes, headers, sha256 round-trip, 404/405/OPTIONS
npm run dev -w @sichos-kodesh/catalog-api     # http://localhost:8788 through the same handler
```

`generated/` is build output and git-ignored. `api/index.js` is the
committed esbuild bundle of the function (see below) - never edit it
by hand.
