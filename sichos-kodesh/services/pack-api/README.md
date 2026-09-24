# @sichos-kodesh/pack-api

The pack API (`docs/offline-plan.md`, WP5). It is a Cloudflare Worker
over R2 that serves the published archive, and it streams a signed pack
for any selection.

| Route | What it returns |
| --- | --- |
| `GET /v1/meta` | What is published: catalog version, years, audio profiles, `objects.json`'s stamp |
| `GET /v1/catalog/<year>` | That year's farbrengens, for the download site's pickers |
| `GET /v1/objects.json` | The objects index: the trust anchor for loose files on the phone |
| `GET /v1/packs/index.json`, `/v1/packs/<file>` | The prebuilt packs |
| `GET /v1/size?scope=&profile=&sections=&maxMb=` | The exact bytes, occasions and parts of a selection |
| `GET /v1/build?…&part=N` | That selection (or one part of it) as a signed `.skpack`, streamed |

`scope` and `sections` read exactly as in `sk-pack build` (pack-format's
`parseScope` and `parseSections`). The plan is also the same:
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
