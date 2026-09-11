# @sichos-kodesh/media-proxy

A Cloudflare Worker that proxies Google Drive-hosted hanacha/maamar PDFs
and JEM's CloudFront-hosted audio so the app never shows a user a
`drive.google.com` or `cloudfront.net` URL, a Drive viewer, or any other
source-site UI. Every download/stream goes through this Worker's own
domain; from the client's perspective a file "just downloads" and audio
"just plays," the way a track does in Spotify — then it's saved locally
and opened/played in the app's own PDF viewer and audio player.

## Why this exists (Phase 1 of the storage plan in `docs/PLANNING.md`)

Google Drive is a genuinely bad target for direct, automated, at-scale
downloading: files over ~100MB get served behind a "can't scan for
viruses" interstitial instead of the file itself, requiring a
`confirm=<token>` retry dance that a mobile client shouldn't have to
replicate. A server-side proxy handles that once, reliably, and gives the
client one simple, stable API regardless of what Drive does on any given
file.

This is deliberately the *first* step, not the whole plan:

- **Phase 1 (this Worker, as built)**: stateless proxy, no storage of our
  own. Every request still round-trips to Drive; the Worker only hides the
  source and handles the confirm-token dance. Uses Cloudflare's free edge
  Cache API as a light optimization (same file requested twice within 7
  days is served from cache, not re-fetched from Drive).
- **Phase 2 (not built yet)**: add an R2 bucket behind the same route
  shapes — first request fetches from the real source and writes to R2,
  every request after that serves straight from R2. The client-facing API
  doesn't change; only what's behind it does. R2's pricing (as of this
  writing: 10GB storage / 1M writes / 10M reads free, then $0.015/GB-month
  storage with **egress always free** — unlike S3) is why R2 specifically,
  not another object store: for a media-serving app, free egress is the
  whole ballgame.

## Scope: Drive (text) + JEM audio; video still deliberately excluded

- **Video via YouTube** genuinely can't be proxied this way regardless of
  the underlying content's rights status — downloading video from YouTube
  outside their own official download feature is a YouTube Terms of
  Service issue, separate from whatever rights JEM has released. Treat
  YouTube-sourced video as stream-via-embedded-player-when-online, not an
  offline download target, unless that changes.
- **Audio via ashreinu.app / JEM** *is* wired up (`/jem-audio/:filename`).
  The links mafteiach.app has aren't direct file URLs, they're
  `ashreinu.app/#/player/...` SPA routes — resolving those to real files
  needed a separate step (see `packages/mafteiach-index`'s `jemAudio.ts`
  and `jem_audio` table): investigating ashreinu.app's own client bundle
  found JEM runs real infrastructure for this — a CloudFront CDN serving
  `.opus`/`.m4a`/`.mp3` files directly, and a structured "ccdb" API
  (years → dates → events → audio recordings) behind AWS API Gateway,
  confirmed live and **unauthenticated**. This is JEM's private,
  undocumented backend, not a published third-party API — it's being used
  now for private, pre-launch development (this project has no live users
  yet), with a real conversation with JEM about formalizing this planned
  before it ships to anyone else. If that conversation doesn't land, the
  fallback is the released Google Drive audio folder instead — same
  `/drive/:fileId` route this Worker already has, no new code needed.

## Usage

```
GET /drive/:fileId?filename=optional-name.pdf
GET /jem-audio/:filename          # e.g. /jem-audio/JEMSK0001.mp3
```

`fileId` is Google Drive's file id (the same id embedded in the
`drive.google.com/file/d/{id}/view` or `?id={id}` URLs already in the
mafteiach-index dataset's `links` table) — extract it client-side or
server-side from the stored URL; this Worker takes the bare id, never a
full Drive URL, so it can validate the input shape before proxying
anything.

`filename` for `/jem-audio/` is the CloudFront object name resolved by
`packages/mafteiach-index`'s JEM audio resolver and stored in its
`jem_audio` table (e.g. `JEMSK0001.mp3`, `AR0017467.mp3`) — again, never a
full CloudFront URL.

Both routes forward an incoming `Range` header to the upstream source and
relay a real `206 Partial Content` with `Content-Range` back — needed for
an audio player to seek within a track without re-downloading the whole
file. Ranged requests always round-trip live and skip the Phase-1 cache,
so a player never risks being served a stale or mismatched cached slice.

## Development & deployment

```
npm install
npm test         # vitest - confirm-token extraction, URL/filename validation, mocked-fetch flow (Drive + JEM audio, incl. Range forwarding)
npm run dev       # wrangler dev - local test server
npm run deploy    # wrangler deploy - requires `wrangler login` or a CLOUDFLARE_API_TOKEN first
```

`wrangler login` (interactive) or a `CLOUDFLARE_API_TOKEN` environment
variable needs to be set up before `deploy` will work. The free Workers
plan (100k requests/day) is enough to start; upgrade to the $5/mo plan
(10M requests/month) only once real usage approaches that.

**Deployed and live**: `https://sichos-kodesh-media-proxy.shmuky.workers.dev`
(free tier) - verified with a real ranged request against a known audio
file (`206 Partial Content`, correct `Content-Range`, no leaked origin
headers). `apps/mobile/src/config.ts`'s `MEDIA_PROXY_BASE_URL` points here.
Redeploying (`npm run deploy`) updates this same URL in place.
