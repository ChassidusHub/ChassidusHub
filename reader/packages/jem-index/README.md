# @chassidushub-reader/jem-index

An **independent** index of JEM's own audio catalog — the private "ccdb" API
behind [ashreinu.app](https://ashreinu.app) — built directly from JEM's data,
not derived from whatever `packages/mafteiach-index` happens to link to.
JEM is the primary source for these recordings (they released the archive
publicly so bochurim could have it on their own devices), so their own
dates, names, and event structure are the authoritative ones to index,
independent of whether this app ever integrates live with JEM.

Ashreinu.app already lets a user download the original audio file locally —
this is the same content, indexed for a more convenient offline experience
(see `services/media-proxy`), not a new source of recordings.

## The ccdb API (reverse-engineered, undocumented, unauthenticated)

Base URL: `https://5qlaecnhel.execute-api.us-east-1.amazonaws.com/prod/ashreinu/api/v1`

Three endpoints cover a full catalog crawl:

| Endpoint | Returns |
|---|---|
| `years?has=audio` | every Hebrew year with at least one audio recording |
| `events?year={y}&has=audio` | every top-level event in year `y` with audio |
| `event/{id}` (singular) | one event's full tree — `sub_events` and `audio_recordings` at every level, in a single response |

None of the three require authentication. Audio itself is served from a
public CloudFront CDN (`https://dtgj2yu3gmlic.cloudfront.net/{filename}.mp3`),
also unauthenticated and range-request-capable (`accept-ranges: bytes`).

The plural form is a trap: `events/{id}` (and `event?id={id}`,
`audio-recording?event={id}`) all return
`{"message":"Missing Authentication Token"}` with HTTP 403 — which reads
like an auth failure but is actually just AWS API Gateway's generic "no
route matches this path" response. The real route is the **singular**
`event/{id}`, which works with no credentials of any kind.

This is JEM's private backend for their own app, not a published/supported
API — `httpClient.ts` sends an honest, identifying User-Agent (the
crawler's purpose and a contact point) and rate-limits itself, the same
posture as `packages/mafteiach-index`.

## Event tree shape and recording dedup

A ccdb `Event` is a tree: a top-level Farbrengen has `sub_events` for each
individual sicha/maamar, and `audio_recordings` can attach at any level.
A parent event's own `audio_recordings` field is a rolled-up aggregate of
everything nested under it — the same recording ids reappear at the parent
as at each leaf. `flatten.ts`'s `flattenEventTree` visits children first
(depth-first) and dedupes by recording id via a `Set`, so a tree isn't
double- (or triple-) counted.

Every node (not just leaves) is kept, since parent nodes carry the
authoritative Farbrengen-level name/date even when they have no audio of
their own — `has_own_audio` on each row distinguishes "this exact node has
a recording" from "some descendant does."

## Data model

- `events` — one row per tree node (top-level Farbrengen or any
  descendant sicha/maamar), with the Hebrew/secular date denormalized into
  real columns (from the first entry of ccdb's `dates` array — there is
  normally exactly one) so "every event on Hebrew date X" is a plain
  indexed query, not a JSON-blob scan. `content_hash` / `first_seen_at` /
  `last_changed_at` / `last_crawled_at` follow the same incremental-sync
  bookkeeping pattern as `mafteiach-index`'s `db.ts`.
- `audio_recordings` — one row per (event, recording asset), fully
  replaced (not appended) on every crawl of that event, so a recording JEM
  removes or adds is reflected on the next run.

Full shapes in `src/types.ts`.

## Running the crawl

```
npm install
npm run crawl                              # every year with audio, ~2,900 top-level events, ~20-25 min
npm run crawl -- --years 5711,5712         # pilot: just these years
npm run crawl -- --db ./jem.db --cache ./.cache --delay-ms 400
```

One request for the year list, one `events?year=Y` listing per year, then
one `event/{id}` tree fetch per top-level event — each tree fetch already
returns every descendant node and recording in a single response, so the
total request count is small relative to the number of rows produced
(~2,955 requests → tens of thousands of event/recording rows). Safe to
interrupt and re-run: `httpClient.ts` caches every raw response to disk by
URL, so a re-run after an interruption replays cached years/events for
free and only fetches what's missing; `upsertEvent`'s content-hash check
means a fully-cached, fully-unchanged re-run only bumps
`last_crawled_at`, not `last_changed_at`.

## Full crawl results

A full run against the live API (43 years, 2,911 top-level events)
completed cleanly with zero errors:

| Metric | Count |
|---|---|
| Hebrew years covered | 43 (5709-5752) |
| Top-level events | 2,911 |
| Total nodes (top-level + every descendant sicha/tefillah/etc.) | 8,941 |
| Nodes with their own audio recording | 8,140 |
| Audio recordings (deduplicated) | 8,142 |
| Total audio duration | 2,722.1 hours (~113 days) |
| File format | 100% mp3 |

This is well beyond `mafteiach-index`'s 1,303 audio-bearing occasions
(564 combined hours), since JEM's own catalog isn't limited to
farbrengens: the top-level event `type` breakdown includes Shacharis (491),
Minchah (447), Ma'ariv (419), Sicha (274), Children's Rallies, private
audiences, and dozens of other davening/gathering occasion types, alongside
461 Farbrengens. Some years have far more top-level events than others
(5748: 591, 5725: 555, 5749: 305) — those are the years with the densest
day-by-day recording coverage, largely post-Gimmel Tammuz. 1,278 nodes
additionally have `has_transcript: true`.

## What's committed vs. generated locally

`.cache/`, `data/`, and `*.db*` are gitignored — same reasoning as
`packages/mafteiach-index`: this is JEM's own catalog data (event names,
dates, recording durations, direct CloudFront URLs to copyrighted
recordings), not this repo's own authorship, and there hasn't yet been an
actual conversation with JEM about terms for this specific use. The
crawler code, tests, and a fixture are committed so the dataset is fully
reproducible by anyone who runs `npm run crawl` themselves; the dataset
itself is a local build artifact.

## Known gaps / not yet modeled

- No cross-reference yet to `packages/mafteiach-index`'s occasion ids —
  each package stands on its own. `packages/mafteiach-index/src/jemAudio.ts`
  already resolves ashreinu.app player links found *on* mafteiach.app back
  to ccdb event ids for 1,165 of its 1,303 audio-bearing occasions; a
  proper join between the two catalogs (by Hebrew date + occasion type, or
  by JEM's own event ids where mafteiach.app happens to link to them) is
  future work.
- Video/transcript assets in ccdb (if any exist beyond audio) aren't
  modeled — this package only requests `has=audio`, per the full official
  *audio* index it's meant to build.
