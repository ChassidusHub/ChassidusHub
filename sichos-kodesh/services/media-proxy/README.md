# @sichos-kodesh/media-proxy

A Cloudflare Worker that proxies Google Drive-hosted hanacha/maamar PDFs so
the app never shows a user a `drive.google.com` URL, a Drive viewer, or any
other source-site UI. Every download goes through this Worker's own domain;
from the client's perspective a file "just downloads," the way a track
downloads in Spotify — then it's saved locally and opened in the app's own
PDF viewer.

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
- **Phase 2 (not built yet)**: add an R2 bucket behind the same
  `/drive/:fileId` route — first request fetches from Drive and writes to
  R2, every request after that serves straight from R2. The client-facing
  API doesn't change; only what's behind it does. R2's pricing (as of this
  writing: 10GB storage / 1M writes / 10M reads free, then $0.015/GB-month
  storage with **egress always free** — unlike S3) is why R2 specifically,
  not another object store: for a media-serving app, free egress is the
  whole ballgame.

## Scope: Drive (text) only, not audio or video, on purpose

This Worker only proxies Drive links — the hanacha/maamar PDFs. Audio
(ashreinu.app) and video (YouTube, JEM's videos.jem.tv, etc.) are
deliberately **not** wired up here yet:

- **Video via YouTube** genuinely can't be proxied this way regardless of
  the underlying content's rights status — downloading video from YouTube
  outside their own official download feature is a YouTube Terms of
  Service issue, separate from whatever rights JEM has released. Treat
  YouTube-sourced video as stream-via-embedded-player-when-online, not an
  offline download target, unless that changes.
- **Audio via ashreinu.app** turned out to be more involved than expected:
  the links mafteiach.app has aren't direct file URLs, they're
  `ashreinu.app/#/player/...` SPA routes. Investigating ashreinu.app's own
  client bundle found that JEM runs real infrastructure for this — a
  CloudFront CDN serving `.opus`/`.m4a`/`.mp3` files directly, and a
  structured "ccdb" API (years → dates → events → audio) behind AWS API
  Gateway. That's genuinely useful intel, but it's JEM's **private,
  undocumented** backend, not a published third-party API — proxying it
  quietly is a different thing than proxying a Drive link someone already
  shared, even under the same generally-permissive rights posture. This
  belongs in the planned JEM outreach conversation (`docs/PLANNING.md`) as
  a concrete "can we build against this properly" ask, not something to
  wire up unilaterally. If JEM says yes, extending this Worker (or adding
  a sibling one) with the same proxy pattern is straightforward — the hard
  part (finding the real API shape) is already done.

## Usage

```
GET /drive/:fileId?filename=optional-name.pdf
```

`fileId` is Google Drive's file id (the same id embedded in the
`drive.google.com/file/d/{id}/view` or `?id={id}` URLs already in the
mafteiach-index dataset's `links` table) — extract it client-side or
server-side from the stored URL; this Worker takes the bare id, never a
full Drive URL, so it can validate the input shape before proxying
anything.

## Development & deployment

```
npm install
npm test         # vitest - confirm-token extraction, URL building, mocked-fetch flow
npm run dev       # wrangler dev - local test server
npm run deploy    # wrangler deploy - requires `wrangler login` or a CLOUDFLARE_API_TOKEN first
```

This repo doesn't have Cloudflare account credentials — `wrangler login`
(interactive) or a `CLOUDFLARE_API_TOKEN` environment variable needs to be
set up locally or in CI before `deploy` will work. The free Workers plan
(100k requests/day) is enough to start; upgrade to the $5/mo plan (10M
requests/month) only once real usage approaches that.
