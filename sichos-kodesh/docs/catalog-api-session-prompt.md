# Prompt for the session that builds `api.sk.shmuky.dev`

Paste everything below the line into a fresh Claude Code session on this
repository. The apps already speak to this API (see `packages/catalog/src/release.ts`
and `packages/app-core/src/catalog/catalogUpdate.ts`); nothing in the apps
has to change for the API to go live.

---

Build and deploy the catalog API at `https://api.sk.shmuky.dev` for the
Sichos Kodesh apps in this repository. The apps are already written against
it; your job is the server side only.

## What the apps expect (the contract - do not change it)

Both apps (`apps/web`, `apps/mobile`) bundle a copy of the catalog (the
list of every farbrengen with its recordings and PDF links) and fetch a
newer one from this API on their own: once a day, after every app update,
and on the phone when the user taps "Update catalog". The exact shapes are
the TypeScript types in `packages/catalog/src/release.ts`
(`CatalogManifest`, `CatalogRelease`) and the client code that consumes them
is `packages/app-core/src/catalog/catalogUpdate.ts`. Read both before
starting.

Two endpoints, both plain JSON, both `GET`, both with
`Access-Control-Allow-Origin: *` (the web app is on another origin):

1. `GET /v1/catalog/manifest.json` - the latest release's manifest:
   `schemaVersion`, `version` (semver, e.g. `1.0.0`), `releasedAt`, `url`
   (absolute URL of that release's `catalog.json`, i.e. endpoint 2),
   `bytes`, `sha256`, `years`, `occasions`, `changelog` (most recent
   first; the same array as `packages/catalog/src/changelog.ts`). Serve it
   with `Cache-Control: public, max-age=300` - the apps fetch it with
   `cache: 'no-store'`, but the CDN may cache it briefly.
2. `GET /v1/catalog/<version>/catalog.json` - the data for one release
   (`schemaVersion`, `version`, `releasedAt`, `byYear`). It is versioned,
   so serve it with `Cache-Control: public, max-age=31536000, immutable`.
   About 2.6 MB; gzip/brotli it.

Optional but useful: `GET /v1/catalog/changelog.json` (the changelog
array alone) and `GET /v1/catalog/latest/catalog.json` as a 302 to the
current version's file. Anything else is a 404 with a small JSON body.

## Where the files come from

A catalog release is a git tag `catalog-v<version>` on this repository.
The workflow `.github/workflows/catalog-release.yml` runs on that tag and
attaches exactly the two files above (`catalog.json`, `manifest.json`) to
a GitHub release of the same tag - built by
`npm run release-files -w @sichos-kodesh/catalog` (`packages/catalog/bin/release.ts`),
which stamps them with `CATALOG_VERSION` from `packages/catalog/src/version.ts`.
The manifest's `url` is built from `--base-url`, which defaults to
`https://api.sk.shmuky.dev`. You can run that script locally now to get
real files to develop against (they land in `packages/catalog/dist-release/`).

The API must serve the files of the newest `catalog-v*` release. Pick one
of these and implement it fully:

- **Preferred: Cloudflare Worker + R2.** Same stack as
  `services/media-proxy` (a Worker deployed with wrangler; look at its
  `wrangler.toml` and its CORS handling and follow the same conventions,
  in a new `services/catalog-api` workspace package). Add a step to
  `catalog-release.yml` that uploads the two files to an R2 bucket under
  `catalog/<version>/catalog.json` and `catalog/manifest.json` (wrangler
  `r2 object put`, using repository secrets `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` - document that these need to be added), so a
  tag push publishes the release end to end. The Worker reads from R2 and
  sets the headers above. Custom domain `api.sk.shmuky.dev` on the Worker
  (DNS for `sk.shmuky.dev` is at Cloudflare; document the exact dashboard
  or wrangler steps the owner has to do by hand).
- **Alternative if R2 is a problem:** the Worker proxies the GitHub
  release assets (`https://github.com/shmuky/Sichos-Kodesh/releases/download/catalog-v<version>/...`)
  and finds the newest `catalog-v*` tag through the GitHub API, caching
  the answer at the edge for 5 minutes. No upload step needed, but
  document the rate-limit behaviour.

## Requirements

- A request for a version that does not exist is a 404 JSON body, never
  a 500 and never the wrong version's data.
- `manifest.json` served must always point (`url`) at a `catalog.json`
  the same API serves, with matching `version` - the apps reject a
  mismatch (`fetchCatalogRelease` in app-core).
- Never modify the file contents in transit; the manifest's `sha256` is
  the SHA-256 of the exact bytes of `catalog.json`.
- CORS: `*` origin, `GET, HEAD, OPTIONS`, and handle a preflight.
- Add the new service to the root `package.json` workspaces if it is a
  package; add its deploy command to its README and to
  `packages/catalog/README.md`'s "Catalog releases" section (a short
  "how the API gets the files" paragraph).
- Test: a small script or vitest suite in the service that starts the
  Worker locally (`wrangler dev`) with the files from `release-files` and
  checks both endpoints, the headers, the 404, and that the manifest's
  `url` resolves to the same bytes whose hash is in `sha256`.
- When it is deployed, verify from outside:
  `curl -sI https://api.sk.shmuky.dev/v1/catalog/manifest.json` shows the
  CORS and cache headers, and the web app at `https://sichoskodesh.vercel.app`
  (Settings › Catalog version, or About) shows "Updated from the server"
  after the next release is tagged with a higher `CATALOG_VERSION`.

## Out of scope

Do not change anything under `apps/` or `packages/catalog/src/release.ts`;
if the contract seems wrong, say so in your summary instead of changing
it. Do not build an admin UI, authentication, or a database - the API is
read-only static files behind a tiny router.
