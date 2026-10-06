# @sichos-kodesh/media-proxy

A Cloudflare Worker that proxies Google Drive-hosted hanacha/maamar PDFs
and JEM's CloudFront-hosted audio so the app never shows a user a
`drive.google.com` or `cloudfront.net` URL, a Drive viewer, or any other
source-site UI. Every download/stream goes through this Worker's own
domain; the Worker fetches from the real source server-side and streams
bytes back under its own API, then the file is saved locally and
opened/played in the app's own PDF viewer and audio player.

## Why a proxy

Google Drive is a poor target for direct, automated, at-scale downloading:
files over ~100MB are served behind a "can't scan for viruses"
interstitial instead of the file itself, requiring a `confirm=<token>`
retry dance. A server-side proxy handles that once, and gives clients one
simple, stable API regardless of what Drive does for any given file.

The Worker is a stateless proxy today: no storage of its own beyond a
short-lived edge cache (Cloudflare's Cache API — same file requested twice
within 7 days is served from cache instead of re-fetched from the source).
The route shapes are designed so a persistent store (e.g. an R2 bucket)
could sit behind them later without changing the client-facing API.

## Scope: Drive PDFs + JEM audio; video is not proxied

- **Video (YouTube)** is not proxied — downloading video from YouTube
  outside their own official download feature is a YouTube Terms of
  Service issue, separate from whatever rights apply to the underlying
  content. Video is streamed via an embedded player when online, not
  offered as an offline download.
- **Audio via JEM** is wired up at `/jem-audio/:filename`. The source
  links (`ashreinu.app/#/player/...` SPA routes) aren't direct file URLs;
  `packages/mafteiach-index`'s `jemAudio.ts` resolves them against JEM's
  private, undocumented "ccdb" API (years → dates → events → audio
  recordings, unauthenticated, served through AWS API Gateway) to a real
  CloudFront filename, stored in its `jem_audio` table. This route is used
  for private, pre-launch development ahead of a formal agreement with
  JEM about serving their audio; if that doesn't land, the fallback is the
  Drive-hosted audio folder via the existing `/drive/:fileId` route.

## Usage

```
GET /drive/:fileId?filename=optional-name.pdf&resourcekey=optional-key
GET /jem-audio/:filename          # e.g. /jem-audio/JEMSK0001.mp3
```

`fileId` is Google Drive's file id (the id embedded in
`drive.google.com/file/d/{id}/view` or `?id={id}` URLs in the
mafteiach-index dataset's `links` table). This Worker takes the bare id,
never a full Drive URL, so it can validate the input shape before
proxying anything.

`resourcekey` is required for links shared before Google's 2021
resource-key change — roughly 4% of the dataset's Drive PDF links — since
a file that needs one 404s/redirects to a sign-in page without it, even
though it's genuinely public. It's present as a `resourcekey=` param on
the original share URL when required.

`filename` for `/jem-audio/` is the CloudFront object name resolved by
`packages/mafteiach-index`'s JEM audio resolver and stored in its
`jem_audio` table (e.g. `JEMSK0001.mp3`, `AR0017467.mp3`), never a full
CloudFront URL.

Both routes forward an incoming `Range` header to the upstream source and
relay a real `206 Partial Content` with `Content-Range` back, so a player
can seek within a track without re-downloading the whole file. Ranged
requests always round-trip live and skip the edge cache, so a player
never risks a stale or mismatched cached slice.

## Development & deployment

```sh
npm install
npm test          # vitest — confirm-token extraction, URL/filename validation, mocked-fetch flow (Drive + JEM audio, incl. Range forwarding)
npm run dev        # wrangler dev - local test server
npm run deploy     # wrangler deploy - requires `wrangler login` or a CLOUDFLARE_API_TOKEN first
```

`wrangler login` (interactive) or a `CLOUDFLARE_API_TOKEN` environment
variable needs to be set up before `deploy` will work. The free Workers
plan (100k requests/day) is enough to start; upgrade to the $5/mo plan
(10M requests/month) once real usage approaches that.

There is no CI/CD for this Worker — `npm run deploy` has to be run by hand
after every change, or the live Worker keeps running old code.

**Deployed** on the chassidushub.org account: `https://media.sk.chassidushub.org`
(`wrangler.toml`; also `sichos-kodesh-media-proxy.chassidushub-org.workers.dev`).
The apps' `MEDIA_PROXY_BASE_URL` points here. Phones installed before the move
still call `sichos-kodesh-media-proxy.shmuky.workers.dev` (also to tell whether
they are online), so that Worker stays up on the old account until they have
updated.
