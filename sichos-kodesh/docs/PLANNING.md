# Sichos Kodesh Offline App — Architecture & Plan

This supersedes the original planning brief. Two pieces described here are no
longer just a design:
- The kvius/scheduling engine — built, tested, at
  [`packages/kvius-engine`](../packages/kvius-engine).
- The farbrengen ground-truth indexer — built, tested, at
  [`packages/mafteiach-index`](../packages/mafteiach-index), crawling
  mafteiach.app for the real per-occasion mugah/bilti-mugah/audio/video
  breakdown (see "Sichos/Farbrengen Ground-Truth Data" below).

Everything else (content rights, mobile app, backend) is still a plan
pending the decisions listed at the bottom.

## Overview

A phone app that hosts the Rebbe's recorded Sichos Kodesh and Farbrengens and
lets people download by farbrengen, month, or year — fully self-contained
offline playback, no follow-up network calls. The differentiating feature is
**kvius auto-download**: the user picks a historical Hebrew year to "follow
along with," and the app keeps their device stocked with that year's
recording for the matching week/date of the *current* Hebrew year.

The build has two genuinely separate hard problems that don't block each
other:

1. **The kvius/calendar math** — solved. It's pure computation with no
   external dependency on anyone's dataset or goodwill. Built and tested
   (see below).
2. **Which farbrengens exist, and the right to distribute them** — not
   solved, and not solvable by writing more code. This is the actual long
   pole, per research below.

## Content & Rights Strategy

### What research changed from the original brief

- **Ashreinu is not an independent competitor — it's JEM's own product.**
  jemcentral.org confirms Ashreinu is "a branch of JEM dedicated to
  collecting, restoring, and making the audio recordings of the Rebbe's
  Farbrengens accessible" (ashreinu.app). Treat it as JEM's audio-clip
  channel, not a third party to compete with or separately license from —
  any conversation with JEM likely already covers it.
- **RebbeDrive is the real prior art to worry about**, not Ashreinu.
  rebbedrive.com describes itself as "the online Chabad database" —
  full audio/video archive of sichos and farbrengens, handwritten letters,
  diaries, photos, seforim — free, with an existing iOS/Android app that
  already supports "look up any Sicha, or watch any Farbrengen." If this
  app's differentiator is only "an existing archive with search," RebbeDrive
  already does that. **The kvius auto-download/scheduling feature is the one
  concrete gap** — nothing found in research suggests RebbeDrive or Ashreinu
  do calendar-driven bulk scheduling. That should be treated as the entire
  value proposition, not one feature among several.
- **berel.me's kvius resources are static print charts, not a dataset or
  API.** Direct inspection:
  - `berel.me/shabbosfarbrengens` is confirmed real and exactly the
    rows=years / columns=date+parsha / cells=farbrengen-or-not structure
    described in the original brief — but the only outputs offered are PDF
    and PNG exports at print sizes (Letter/Ledger/A4) with a QR code back to
    the page. There is no JSON/CSV/API. To use this as a data source we'd
    need Berel to hand over the underlying spreadsheet/database directly —
    the rendered chart alone would need OCR or manual transcription.
  - `berel.me/kvius` doesn't render a calculator at all — it 302-redirects
    straight to a Google Drive PDF ("Table of kvius-matched years for 5785,
    per Toras Rabbeinu"). So the "kvius calculator" mentioned in the
    original brief is, in current form, a static per-year PDF someone
    regenerates annually, not a live tool. **Our engine (below) already
    does this live, for any year — this alone may be worth offering back to
    Berel as something he'd want to link to or use**, which reframes the
    outreach from "can we have your data" to "we built the live version of
    your PDF, want to collaborate."
  - `berel.me/f` ("Full Farbrengen video Index from JEM") is still
    bot-blocked (403) from this environment too — genuinely unverified.
    Needs a human to check in a real browser, or Berel to confirm directly.
  - **Recommendation stands**: contact Berel Marozov early, but go in with
    a demo of the live engine rather than just an ask — better odds of a
    real collaboration, and clarifies fast whether his chart's underlying
    data (which years had which farbrengens) is something he'll share.
- **JEM has no public bulk-licensing API.** jemcentral.org's own guidance:
  licensing is negotiated per request ("after initially contacting JEM,
  customers are urged to find and select the content on their own"), with a
  paid research-by-the-hour option for larger asks. Contact:
  support@jemedia.org / 718-774-6000. This is a **business/legal
  negotiation, not an integration task** — budget real calendar time and
  possibly a legal-savvy point of contact, not engineering time, for this
  track.
- **RebbeDrive's own rights basis is unverified.** It's unclear from public
  sources whether RebbeDrive operates under a JEM license, an independent
  claim, or something looser — worth asking JEM directly "are you aware of
  / do you endorse RebbeDrive's redistribution" as part of the same
  conversation, since the answer shapes how much legal risk a similar
  from-scratch archive would carry.

### Recommended strategy, in order

1. **Talk to RebbeDrive before building a rival archive.** If they already
   have rights-cleared (or tolerated) content and a real app, the highest
   leverage move may be proposing the kvius engine as a feature/partnership
   rather than duplicating their entire catalog. This wasn't in the
   original brief's framing (which only positioned RebbeDrive as
   competitive analysis) and deserves a real conversation, not just a
   feature comparison.
2. **Talk to Berel Marozov**, demoing the live engine, to learn (a) whether
   he'll share the underlying farbrengen-existence data behind
   `/shabbosfarbrengens`, and (b) what "Toras Rabbeinu" actually is as a
   source (a published seforim volume? internal reference? worth tracking
   down independently either way).
3. **Talk to JEM** about licensing terms regardless of what RebbeDrive/Berel
   yield — JEM is the actual rights holder for most restorations, and any
   distribution strategy eventually routes through them or around them
   knowingly.
4. **Fallback if all three are unreachable/unwilling**: the Google Drive
   folder (`otzrosharebbe@gmail.com`, "1. Sichos Kodesh") is a one-time seed
   source at best (see original brief's caveats — inconsistent coverage,
   no SLA, owner-controlled, `resourceKey`-style sharing). Treat any content
   pulled from it as **unlicensed and unpublishable** until JEM (or
   whoever's rights actually attach to it) explicitly clears it — build and
   test the app against it privately, but do not ship distribution of that
   media without clearance. In the meantime the app can ship against a
   small set of already-cleared or public-domain recordings, or launch as
   "schedule + link out to JEM/Ashreinu/RebbeDrive players" rather than
   self-hosted media, deferring offline bulk download until rights land.

## Existing Prior Art to Leverage

| Source | What it actually is (verified) | Use it for |
|---|---|---|
| RebbeDrive (app + site) | Free, broad Chabad archive incl. full sichos/farbrengens audio+video, letters, diaries, photos, seforim. Has iOS/Android app with sicha/farbrengen lookup. | Partnership conversation; competitive baseline for "what a rival build already does." |
| Ashreinu (JEM) | JEM's own curated audio-clip app/channel for farbrengens — not independent. | Fold into the JEM conversation; not a separate competitor. |
| berel.me/shabbosfarbrengens | Real chart, PDF/PNG export only, no API. | UX reference for the exact matrix this app's engine needs; potential data-sharing ask. |
| berel.me/kvius(+5786) | Static per-year PDF via Drive redirect, not a live calculator. | Superseded by this repo's engine — consider offering it back. |
| berel.me/taste | Live weekly PDF "taste" of the farbrengen matched to the week's parsha, with email subscribe + archive. | Closest prior art for "auto-deliver content matched to the current calendar week," for text; validates the demand/mechanism, not directly reusable for video. |
| berel.me/f | Claimed "Full Farbrengen video Index from JEM." | Unverified (403 here) — needs a human browser check or a direct ask to Berel. |
| berel.me/findasicha, /today, /hebrewdate | Adjacent Likkutei Sichos / date-lookup tools. | Not core-path, but useful for a later "related text" feature and worth knowing exist so we don't rebuild them. |
| **Mafteiach.app** | **Not** just an adjacent lookup tool — turned out to be the actual ground-truth source for this app's core dataset. See below. | Now indexed: [`packages/mafteiach-index`](../packages/mafteiach-index). |
| JEM (jem.tv / jemedia.org) | Official restorer/rights-holder for most recordings; per-request licensing, no bulk API. | The actual rights gate for shipping any self-hosted media. |

## Sichos/Farbrengen Ground-Truth Data

The open question from the first draft of this doc — "which years the Rebbe
farbrenged on a given matched Shabbos... is real-world data the engine
cannot derive" — has a real answer now: **mafteiach.app**. Direct
inspection (not the original brief's assumption) found:

- Its `robots.txt` has no restrictions at all — unlike lahak.org, which
  403s a plain fetch and runs on Chabad.org's platform (whose `robots.txt`
  disallows most sections and is the actual commercial rights-holder for
  its hanachos), and unlike berel.me's charts, which are PDF/PNG print
  exports with no underlying data file to fetch at all.
- Per farbrengen/sicha occasion, it tracks **exactly** the breakdown this
  app needs: mugah (Rebbe-edited) vs. bilti mugah (unedited hanacha) text,
  each with links to source scans and printed-volume citations; audio
  (linking to **ashreinu.app** — confirming, independently, this doc's
  earlier finding that Ashreinu is JEM's own audio app, not a separate
  product); video (embedded YouTube ids); English translations; maamarim;
  and mafteiach.app's own editorial content-outline per occasion.
- **Confirmed real scope**: 3,424 unique indexed occasions across the
  site's real coverage (one combined pre-Nesius bucket for 5690-5710, then
  individual years 5711-5752) — not the 60+ years × 50-150/year that
  brute-forcing every year number naively suggested. Two nuances the
  indexer had to reverse-engineer and now handles correctly, documented in
  full in that package's README: (1) requesting a year outside real
  coverage silently renders 5711's content instead of 404ing, so the
  crawler uses the site's own sidebar nav as the source of truth for valid
  years rather than trusting every year number; (2) a leap year's Adar is
  encoded as `06A`/`06B` (Adar Rishon/Sheini) rather than shifting Nisan's
  month number the way `HDate`'s native numbering does.
- **Full crawl completed** (all 3,424 entries, 5690-5752). Real breakdown:

  | Has... | Count | % of 3,424 |
  |---|---|---|
  | Mugah text (or Reshimos, for pre-Nesius entries) | 2,011 | 59% |
  | Bilti-mugah (hanacha) text | 3,067 | 90% |
  | **Any recording (audio or video)** | **1,314** | **38%** |
  | — audio (ashreinu.app) | 1,303 | 38% |
  | — video, total | 671 | 20% |
  | — — via embedded YouTube | 518 | 15% |
  | — — via a direct outbound link (chabad.org, JEM, Vimeo, etc.) | 153 | 4% |
  | Maamorim | 1,544 | 45% |
  | English translation | 1,245 | 36% |
  | mafteiach.app content-outline | 2,723 | 80% |
  | Hagahos (annotations) | 1,287 | 38% |
  | Hosofos (addenda) | 309 | 9% |

  A post-crawl completeness audit (inventorying every button/class
  literally appearing across all 3,424 cached responses, not just the
  samples used to build the parser) caught one real gap: 153 of those 671
  video-bearing occasions turned out to use a plain outbound link
  (mirroring how `audio` already worked) rather than an embedded YouTube
  player, and were originally reported as having no video at all. Fixed —
  see `packages/mafteiach-index/README.md`'s "Completeness audit" section
  for the full writeup, including a second finding (pre-Nesius entries use
  a reduced 3-button template where the מוגה-labeled slot actually holds
  Reshimos/diary notes) that needed no code fix, just documentation.

  (Rows aren't mutually exclusive — most entries have several.) The
  headline finding for the app's core feature: **only 38% of indexed
  occasions have any recording at all** — the overwhelming majority of
  what exists is text (hanacha/mugah), not audio/video. This directly
  shapes the gap-handling story: the kvius engine's `'nearestKviusYear'`
  fallback strategy isn't a rare edge case, it's the common path if the
  app's initial scope is recordings only. It also reframes the product
  question worth raising with the user: whether v1 should offer *text*
  content (hanachos/mugah sichos as reading material) alongside — or even
  before — audio/video, given recordings are the minority of what actually
  exists for most of the Rebbe's tenure.
- The crawler (`packages/mafteiach-index`) is rate-limited (~750ms between
  requests), caches every response so it's resumable and never re-fetches,
  and identifies itself honestly (a descriptive User-Agent naming the
  project and its purpose) rather than impersonating a browser.
- **Deliberately not committed to this repo**: the full scraped dataset
  and the raw-response cache. Most of what's indexed is either links/
  citations (fine — a citation isn't the cited work) or mafteiach.app's own
  written content-outline per occasion, which is their copyrightable
  expression, not a bare fact. The crawler code + tests + real fixtures are
  committed so the dataset is fully reproducible; actually publishing or
  shipping their editorial text in-app should go through the same kind of
  conversation already planned with Berel and JEM, not just because it was
  technically fetchable.

This changes the Phase 1 rights-and-data picture materially: the
**bibliographic ground truth** (which dates had a farbrengen, what exists
for it) is now something this repo can generate and keep current itself,
independent of Berel's or JEM's cooperation. What still depends on those
conversations is exactly one thing: **the right to redistribute the actual
media/text**, not knowledge of which media/text exists.

## Data Model

The kvius engine deliberately has **no knowledge of media, titles, or
rights** — its only touchpoint with content is a `hasRecording(year,
occasionKey) -> boolean` predicate (see engine README). The catalog schema
below is what backs that predicate and everything the app UI needs; it's an
application-layer concern, not baked into the engine package.

```ts
interface CatalogEntry {
  id: string;                    // stable content id
  hebrewYear: number;

  // Matches the engine's occasion keying exactly, so `hasRecording` is a
  // direct lookup rather than a re-derivation of calendar logic.
  occasion:
    | { type: 'weekly'; weekIndex: number; parsha: string[] | null }
    | { type: 'fixedDate'; occasionKey: string };

  hebrewDate: { year: number; month: number; day: number };
  gregorianDate: string;         // ISO date, derived + cached for display/sort
  titleEn: string;
  titleHe?: string;
  location?: string;             // e.g. "770 Eastern Parkway"

  mediaType: 'video' | 'audio';
  qualityVariants: Array<{
    label: string;               // e.g. "480p", "audio-only"
    url: string;                 // CDN URL
    sizeBytes: number;
    codec: string;
  }>;
  durationSeconds?: number;
  captions?: { burnedIn: boolean; url?: string; language: string }[];

  sourceRightsStatus: 'jem-licensed' | 'public-domain' | 'pending-clearance' | 'unlicensed-do-not-distribute';
  rightsNotes?: string;

  relatedTextLinks?: Array<{ label: string; url: string }>; // e.g. Likkutei Sichos, Toras Menachem refs
  tags?: string[];
}
```

Notes:
- `occasion.weekIndex` / `occasionKey` line up exactly with
  `weeklyOccasionKey()` / the `key` in `FixedOccasionDef` from the engine —
  this is intentional so the catalog and engine never need a separate
  mapping layer.
- `sourceRightsStatus` is a first-class field, not an afterthought — given
  the rights situation above, the catalog needs to represent "we know this
  exists but can't distribute it yet" as a real, queryable state, not just
  omit the row.
- `mafteiach-index`'s `FarbrengenRecord` (see that package's `types.ts`) is
  the natural seed for this table, not a separate thing to reconcile by
  hand: `detail.audio.hasContent || detail.video.hasContent` answers "does
  a recording exist" directly, `detail.mugah` / `detail.biltiMugah` answer
  the muga/hanacha question, and `hebrewDate`/`occasionLabel` map onto this
  schema's own fields. `sourceRightsStatus` still has to be set by a human
  either way — mafteiach.app tracks *existence*, not *distribution rights*.

## Backend & Storage

Proposed MVP-to-v1 path, cost- and complexity-conscious:

- **Catalog as versioned static JSON, not a live database, for MVP.**
  Content additions are infrequent (curator adds recordings; kvius math
  doesn't change), so a per-Hebrew-year JSON manifest (`5786.json` etc.) on
  a CDN, rebuilt via CI when curators edit a source file, covers v1 without
  standing up a database or API server. A real database (Postgres) becomes
  worth it once there's a curation UI, user accounts, or analytics — v2
  territory, not before.
- **Media storage/CDN**: Cloudflare R2 or Backblaze B2 behind Cloudflare —
  both avoid the egress costs of S3+CloudFront for what could be a large
  video library serving a community audience, relevant for a
  volunteer/nonprofit-scale budget. Store multiple quality variants (see
  data model) so low-bandwidth users aren't forced into full video when
  audio-only would do.
- **Backend service, if any**: a thin Node/TypeScript service is enough —
  serves the static catalog manifests (or just lets the CDN serve them
  directly with no server at all), and is the natural home for
  **`@hebcal/core`-backed computation** (see licensing flag below) if any
  server-side kvius computation is wanted (e.g. computing default matching
  years for push-notification scheduling).
- **Batch download packaging**: per the original brief, bundle a
  month/year's worth of media into a single archive for one resumable
  network transfer, unzipped on-device immediately after download — standard
  approach, unchanged from the original plan, and orthogonal to the
  catalog/CDN choice above.

## Kvius / Scheduling Engine — as built

Lives at [`packages/kvius-engine`](../packages/kvius-engine), TypeScript,
built on `@hebcal/core`, 36 passing tests, runnable demo
(`npm run example`) that prints a real schedule for today's actual Hebrew
date.

**Inputs → outputs, precisely:**

- `kviusSignature(hebrewYear)` → `{ leap, roshHashanaDow, yearLength, yearType }`
  — the four calendar facts that together fully determine a year's
  day-of-week-to-date structure. Computed from `HDate`, not a lookup table.
- `kviusCode(hebrewYear)` → the traditional 3-letter Hebrew mnemonic (e.g.
  `גכה`), for display parity with berel.me-style charts.
- `findMatchingYears(targetYear, { fromYear?, toYear? })` → every year in
  range with an identical signature to `targetYear`, sorted nearest-first.
  This is the picker list for "which year do you want to follow along
  with." Defaults to, and clamps any explicit range to,
  `[MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR]` (5690-5752 - verified
  directly against `packages/mafteiach-index`'s real database, not a
  guess) since a match outside the real catalog's span can never resolve
  to an actual recording; pass `allowOutOfHistoricalRange: true` to search
  past it (used by the engine's own demo/tests, not by either app).
- `buildWeeklySchedule(hebrewYear, il)` → one entry per Shabbat (~50–55/year)
  with its parsha or displacing holiday, keyed by a 0-based `weekIndex`
  anchored to the first Shabbat on/after Rosh Hashana. **Proven invariant
  (tested)**: kvius-matched years produce identical-length arrays with an
  identical parsha/holiday sequence — this is *why* `weekIndex` alone is a
  safe cross-year join key, with no need to fuzzy-match parsha names.
- `buildFixedDateSchedule(hebrewYear, occasionDefs)` → resolves
  date-anchored occasions (Yud-Tes Kislev, Purim, etc.) to that year's
  actual date, with Adar-anchored occasions resolved via a
  `(year) => month` resolver so leap-year Adar I/II doesn't need
  special-casing by the caller.
- **Gap-handling rule** (`resolveOccasion` / `buildMatchedSchedule`), applied
  per occasion in this order:
  1. Manual override for that specific occasion, if set — and if the
     overridden year genuinely has no recording, that's still reported as a
     gap, never silently falling through to the primary source year.
  2. The user's chosen source year, if it has a recording.
  3. Under the `'nearestKviusYear'` strategy only: the *nearest other
     kvius-matched year to the source year* (not to the target year) that
     has a recording — minimizing drift from what the user actually picked.
  4. Otherwise: `{ status: 'gap', resolvedYear: null }` — an explicit,
     typed "no recording available," never a silent skip or a guess.
  Settings this maps onto directly: pick source year (from
  `findMatchingYears`), gap strategy (`'skip'` vs `'nearestKviusYear'`),
  per-occasion manual overrides.
- `il` (Diaspora vs Israel) is a required input throughout, since the Sedra
  schedule genuinely differs in some years — not optional/defaulted away.

**Real output, computed live** (see `npm run example` under
`packages/kvius-engine`, run 2026‑09‑11, current Hebrew year 5786):

```
Kvius code: גכה
4 kvius-matched years in the real catalog (5690-5752): 5742, 5735, 5715, 5691
```

Worth cross-checking this list against berel.me's `/kvius5786` PDF once a
human can open it — if they diverge, that's a real bug to chase, not a
hand-wave; the tests in `tests/matching.test.ts` and `tests/schedule.test.ts`
verify internal consistency (symmetry, structural equality of matched-year
schedules) but not against an external ground truth yet.

## Mobile App & Offline Downloads

- **Framework: React Native, bare CLI (not Expo)** — the concrete reason to
  prefer React Native over Flutter here is unchanged: the kvius engine is
  TypeScript and can be a **directly shared package** between backend and
  app in one repo/monorepo (see `apps/mobile`'s dependency on
  `@sichos-kodesh/kvius-engine` and `@sichos-kodesh/catalog` via npm
  workspaces), with zero re-implementation or cross-language serialization
  of the scheduling logic. The earlier plan called for Expo specifically
  for its dev-client tooling around native modules — that rationale
  evaporates once there's no managed workflow to begin with, and the
  user's explicit preference is a plain Gradle Android project that
  produces installable APKs directly (`./gradlew assembleDebug`), not an
  Expo/EAS-managed build. Originally built via a CI workflow that
  published a debug APK to a floating GitHub Release on every push -
  **removed for now** (testing shifted to `apps/web`, a real installable
  PWA needing no build pipeline or sideloading); see `apps/mobile/README.md`
  and this file's git history to bring it back.
- A real, non-obvious wrinkle hit building this: **npm workspace hoisting
  breaks React Native's default Gradle config** for an app that isn't at
  the repo root. `apps/mobile/android/settings.gradle`'s generated
  `includeBuild("../node_modules/@react-native/gradle-plugin")` assumes
  the package lives in the app's own `node_modules`, but workspace
  hoisting puts it at the repo root instead — fixed by adjusting the
  relative path to `../../../node_modules/...` (documented inline in that
  file). Anyone regenerating `android/` from a fresh RN CLI template in
  this repo will need to reapply that fix.
- **Downloads, as built for the thin MVP**: `react-native-blob-util`
  (`apps/mobile/src/download/download.ts`) for single-file foreground
  downloads through `services/media-proxy`'s `/jem-audio/:filename` and
  `/drive/:fileId` routes. `react-native-background-downloader` (surviving
  app backgrounding, needed once batch month/year downloads are real) is
  deliberately deferred to Phase 3 — a single on-demand download doesn't
  need it, and pulling it in now would be scope the thin MVP doesn't
  require.
- **Offline packaging**: unchanged from the original brief for batch
  downloads (zip the month/year batch, single resumable download, unzip
  locally) — real Phase 3 work, not built yet. For the thin MVP, one file
  at a time is downloaded and played/opened directly (audio via
  `react-native-sound`; PDFs rendered directly in-app via `react-native-pdf`
  on mobile / `pdfjs-dist` on web, with an occasion's own recording
  playable in a persistent bottom bar underneath, rather than handed off to
  the OS's/browser's own viewer).
- **Client-side kvius computation: decided, on-device for now.** The
  engine (and its GPL-2.0 `@hebcal/core` dependency — see open question #1)
  runs directly inside the app bundle, computed live via
  `resolveThisWeek`/`currentHebrewYear` (`packages/catalog/src/resolveThisWeek.ts`).
  Safe for now because nothing is distributed to anyone yet (no App
  Store/TestFlight/Play build shared outside this repo) — **revisit before
  any real release**, per open question #1's options.
- **Bridging the engine's abstract `occasionKey` to real data**: needed
  its own package, `packages/catalog` — the engine has no idea what
  Hebrew date `"week:12"` actually falls on in a given year (that's only
  stable *across* kvius-matched years), and mafteiach-index's `hebrew_date`
  strings use a different month-numbering convention than the engine's
  `HDate`-native one. See that package's README for the full bridge and
  its real, verified date-key conversion. `resolveThisWeek` and
  `currentHebrewYear` live here (not in `apps/mobile`) specifically so
  `apps/web` can share the exact same scheduling logic without
  re-implementing it.

## Web App (`apps/web`) — same MVP slice, for testing without a device

A second, real client for the same thin MVP slice: a Vite + React +
TypeScript **installable, offline-first PWA** (`vite-plugin-pwa`,
`generateSW` mode), sharing `packages/catalog` and
`packages/kvius-engine` with `apps/mobile` via the same npm workspace —
same year-picker/this-week screens, same download-then-play-fully-offline
behavior, just in a browser instead of a sideloaded APK. Built so testing
doesn't require an Android device: any browser (desktop or mobile) can
install it and use it fully offline after the first load. See
`apps/web/README.md` for the real offline-caching details (service worker
precache for the app shell, `CacheFirst` + Workbox range-request support
for already-downloaded media, matching what `apps/mobile` gets from a
local file). Deployed to Vercel.

`services/media-proxy` needed one real addition to support a browser
client: **CORS headers** (`Access-Control-Allow-Origin: *` — safe, since
every route serves public, unauthenticated, read-only content) plus an
`OPTIONS` preflight handler, since a service worker fetching in `cors`
mode (required so Workbox can read `Content-Length` to slice a cached
response for seeking) enforces the same-origin policy that
`apps/mobile`'s plain `fetch` never had to deal with.

## Phased Roadmap

- **Phase 0 — done**: kvius/scheduling engine (this repo,
  `packages/kvius-engine`), fully tested, demoed against the real current
  Hebrew date.
- **Phase 0.5 — done**: farbrengen ground-truth indexer
  (`packages/mafteiach-index`), crawling mafteiach.app's real coverage
  (3,424 unique occasions, 5690-5752) for the mugah/bilti-mugah/audio/video
  breakdown per occasion. This resolves the bibliographic half of "which
  years the Rebbe farbrenged on a given matched Shabbos" independent of
  Berel/JEM outreach — what those conversations still gate is
  redistribution rights, not knowledge of what exists.
- **Phase 1 — rights & data (the actual long pole)**: RebbeDrive
  partnership conversation → Berel Marozov conversation (demo the live
  kvius engine) → JEM licensing conversation → a conversation with
  mafteiach.app's maintainers about terms for using their editorial
  content-outline text (not the bibliographic metadata, which needs no
  permission to use internally). **Still hasn't happened** — but per the
  user's explicit direction, Phase 2 proceeded anyway for **private,
  pre-launch development only** (nothing distributed to anyone outside
  this repo): the same posture already established for JEM's ccdb API and
  the Google Drive fallback. Decide the rights strategy before any real
  release; cross-check the engine's computed matched-years list against
  berel.me's chart once accessible, and against the now-real
  mafteiach-index dataset.
- **Phase 2 — MVP, done (private/pre-launch)**: `packages/catalog` joins
  `packages/mafteiach-index`'s crawled dataset (all 3,424 occasions, not a
  pilot subset) into the app-facing `CatalogEntry` shape and bridges the
  engine's `occasionKey` scheme to real dates. `apps/mobile` and
  `apps/web` (see above) offer two ways to pick a year: **follow along**
  (a source year from `findMatchingYears`, kvius-matched to the current
  year — shows the current week's, or an imminent fixed-date occasion's,
  matched content, auto-resolved) and **browse any year** (every indexed
  year via `browsableYears`, no kvius match required — lists that year's
  whole occasion set directly, since there's no "this week" to compute
  without a kvius match). Either way, content downloads through
  `services/media-proxy` and plays/opens fully offline. `hasContent`
  (not `hasAudio`) gates what counts as real - a PDF transcript with no
  audio is real content, not a gap; gating on audio alone caused every
  kvius-matched year to wrongly show "no recording" for occasions that
  had real PDFs but no JEM audio (e.g. Nitzavim/Vayeilech, the last
  Shabbos before Rosh Hashana). Deliberately thin: one occasion at a time
  in follow-along mode, no batch download, no gap-handling UI beyond a
  plain "nothing indexed" message — see `apps/mobile`'s own scope notes
  for what's intentionally deferred to Phase 3.
- **Phase 3 — v1**: month/year batch download + zip bundling, gap-handling
  UI (surface `'gap'` occasions and let the user set manual overrides),
  push notification when the week's content is ready, minimal
  curator/admin tooling for catalog entry.
- **Phase 4 — v2**: full historical catalog (rights permitting), quality/
  bandwidth settings, related-text links (Likkutei Sichos etc.), search,
  multi-year favorites.

## Open Questions & Risks

1. **`@hebcal/core` is GPL-2.0, not permissive** (confirmed by reading its
   `package.json`, not assumed) — this wasn't flagged in the original brief.
   GPLv2 doesn't restrict server/SaaS use, so it's safe as a backend
   dependency, but bundling it directly into a closed-source React Native
   app binary counts as distributing the combined work and would trigger
   copyleft obligations. **Decision needed**: either (a) keep kvius
   computation server-side and have the app fetch precomputed schedules
   (simplest, works today, costs an otherwise-avoidable network
   round-trip for schedule refresh — though playback of already-downloaded
   media stays fully offline regardless), (b) open-source the app itself
   under a GPL-compatible license (plausible for a community/nonprofit
   project — worth a real conversation, not a default), or (c) invest in a
   clean-room, permissively-licensed reimplementation of just the needed
   primitives (leap-year/molad arithmetic and the sedra-doubling algorithm
   are public-domain math/halacha, so this is legally safe and technically
   scoped — but it's real work, don't do it speculatively before knowing
   whether the app actually needs fully offline schedule computation).
   **Update**: decided (a-for-now) for the thin MVP — the engine runs
   on-device (`packages/catalog/src/resolveThisWeek.ts`, shared by both
   `apps/mobile` and `apps/web`), since nothing is distributed to anyone
   yet and this is easy to change later (the
   engine is a clean, swappable dependency, not entangled with the rest of
   the app). This is **not** a final decision — revisit properly (options
   a/b/c above still all apply) before any real release.
2. **Rights strategy is undecided** and gates everything downstream —
   self-host with JEM license, partner with RebbeDrive, or link-out only.
3. **RebbeDrive partnership feasibility is untested** — no outreach made
   yet; also its own rights basis is unverified from public sources.
4. **Berel Marozov's underlying data** (behind `/shabbosfarbrengens` and
   the kvius PDF) hasn't been requested yet — and "Toras Rabbeinu" as a
   named source is still just a title seen on a chart, not tracked down.
5. **`berel.me/f`** is still unverified (bot-blocked from this
   environment) — needs a human with a real browser, or a direct question
   to Berel.
6. **JEM outreach hasn't happened** — contact is known
   (support@jemedia.org / 718-774-6000) but this is a business/legal track
   with its own timeline, not something further engineering unblocks.
   **Update**: JEM's own private "ccdb" API (behind ashreinu.app) is
   confirmed live, unauthenticated, and technically usable end-to-end —
   see `packages/jem-index`. This doesn't change the outreach need (using
   it in a shipped app still requires that conversation), but it means an
   independent, JEM-sourced catalog of what recordings exist (names, real
   Hebrew dates, durations, direct CloudFront URLs) now exists for internal
   use regardless of whether live JEM integration is ever adopted — see
   that package's README for the full stats.
7. **Engine correctness vs. external ground truth**: the kvius engine's
   calendar math is internally tested (symmetry, structural invariants
   across matched years); the real-world "which years the Rebbe farbrenged
   on a given matched Shabbos" question is now substantially answered by
   `mafteiach-index`'s 3,424-entry dataset rather than an unknown depending
   on JEM/RebbeDrive/Berel — what remains is cross-checking that dataset
   against berel.me's chart and JEM's/RebbeDrive's own catalogs for gaps or
   disagreements, not deriving it from nothing.
8. **mafteiach.app outreach hasn't happened either** — parallel to the
   Berel/JEM conversations: let them know this indexing exists, ask about
   terms for using their editorial content-outline text specifically (the
   bibliographic metadata needs no permission to use internally, but
   publishing their summaries in-app is a separate ask), and find out if
   they'd rather provide a real export/API than have anyone re-scrape it.
9. **Diaspora vs. Israel (`il`)** content strategy — some fixed-date
   occasions (notably day-count around Yom Tov) genuinely differ; decide
   whether the app supports both audiences from day one or launches
   Diaspora-only.
10. **Storage/CDN budget owner** — not decided; relevant once real media
    volume/size estimates exist from Phase 1.
11. ~~`hagahos`/`hosofos` sections in mafteiach-index are unverified~~ —
    **resolved**: spot-checked against real examples once the full crawl
    completed. `hagahos` is a plain link list as assumed; `hosofos` turned
    out to be free-text-with-inline-links (like `tochenInyanim`), not a
    link list — caught before it corrupted the dataset, fixed, and the full
    crawl re-run (all cache hits, no re-scraping needed) to pick up the
    corrected parser. Both now have real-example regression tests.
