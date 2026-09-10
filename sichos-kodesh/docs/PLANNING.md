# Sichos Kodesh Offline App — Architecture & Plan

This supersedes the original planning brief. The kvius/scheduling engine
described here is no longer just a design — it's built, tested, and lives at
[`packages/kvius-engine`](../packages/kvius-engine). Everything else
(content, rights, mobile app, backend) is still a plan pending the decisions
listed at the bottom.

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
| berel.me/findasicha, /today, /hebrewdate, Mafteiach.app | Adjacent Likkutei Sichos / date-lookup tools. | Not core-path, but useful for a later "related text" feature and worth knowing exist so we don't rebuild them. |
| JEM (jem.tv / jemedia.org) | Official restorer/rights-holder for most recordings; per-request licensing, no bulk API. | The actual rights gate for shipping any self-hosted media. |

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
built on `@hebcal/core`, 32 passing tests, runnable demo
(`npm run example`) that prints a real schedule for today's actual Hebrew
date.

**Inputs → outputs, precisely:**

- `kviusSignature(hebrewYear)` → `{ leap, roshHashanaDow, yearLength, yearType }`
  — the four calendar facts that together fully determine a year's
  day-of-week-to-date structure. Computed from `HDate`, not a lookup table.
- `kviusCode(hebrewYear)` → the traditional 3-letter Hebrew mnemonic (e.g.
  `גכה`), for display parity with berel.me-style charts.
- `findMatchingYears(targetYear, { fromYear, toYear })` → every year in
  range with an identical signature to `targetYear`, sorted nearest-first.
  This is the picker list for "which year do you want to follow along
  with."
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
`packages/kvius-engine`, run 2026‑09‑10, current Hebrew year 5786):

```
Kvius code: גכה
Matched years (last 120): 5769, 5766, 5762, 5742, 5735, 5715, 5691, 5688, 5671
```

Worth cross-checking this list against berel.me's `/kvius5786` PDF once a
human can open it — if they diverge, that's a real bug to chase, not a
hand-wave; the tests in `tests/matching.test.ts` and `tests/schedule.test.ts`
verify internal consistency (symmetry, structural equality of matched-year
schedules) but not against an external ground truth yet.

## Mobile App & Offline Downloads

Largely unchanged from the original brief's direction, with one addition:

- **Framework: React Native (Expo, with a dev client for native modules)**
  — the concrete reason to prefer this over Flutter here is that the kvius
  engine is TypeScript and can be a **directly shared package** between
  backend and app in one repo/monorepo, with zero re-implementation or
  cross-language serialization of the scheduling logic. That's a real
  engineering win specific to this project's shape, not just a generic
  "React Native is popular" argument.
- **Background/resumable downloads**: `react-native-background-downloader`
  (wraps native `URLSession` background config on iOS, `DownloadManager` on
  Android) rather than `fetch`/blob-based downloading, which doesn't
  reliably survive backgrounding — especially on iOS, where the OS
  fully owns background download scheduling and a plain in-JS fetch will
  be killed. iOS additionally caps concurrent background transfers and
  gives no hard timing guarantee on resumption; Android's WorkManager path
  is more flexible but still wants a foreground service for large,
  user-visible downloads (month/year bundles).
- **Offline packaging**: unchanged from the original brief — zip the
  month/year batch server-side or at CDN-build time, single resumable
  download, unzip locally right after (e.g. `react-native-zip-archive` or
  equivalent), captions burned in or bundled so playback never calls out.
- **Client-side kvius computation**: see the licensing flag directly below
  before deciding whether the engine ships inside the app bundle or stays
  server-side.

## Phased Roadmap

- **Phase 0 — done**: kvius/scheduling engine (this repo,
  `packages/kvius-engine`), fully tested, demoed against the real current
  Hebrew date.
- **Phase 1 — rights & data (the actual long pole)**: RebbeDrive
  partnership conversation → Berel Marozov conversation (demo the live
  engine) → JEM licensing conversation. Decide the rights strategy before
  writing any more app code that assumes self-hosted media. Cross-check the
  engine's computed matched-years list against berel.me's chart once
  accessible.
- **Phase 2 — MVP**: static JSON catalog for a small pilot (3–5
  kvius-matched year clusters, whatever's actually cleared), CDN-hosted
  media (or link-out to JEM/RebbeDrive players if media isn't cleared yet),
  React Native/Expo app: pick a source year from `findMatchingYears`, view
  the engine-computed schedule, download individual items, offline
  playback.
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
7. **Engine correctness vs. external ground truth**: the engine's
   calendar math is internally tested (symmetry, structural invariants
   across matched years) but the actual list of "which years the Rebbe
   farbrenged on a given matched Shabbos" is real-world data the engine
   cannot derive — it depends entirely on whichever content source (JEM,
   RebbeDrive, Berel's chart) ends up backing the catalog.
8. **Diaspora vs. Israel (`il`)** content strategy — some fixed-date
   occasions (notably day-count around Yom Tov) genuinely differ; decide
   whether the app supports both audiences from day one or launches
   Diaspora-only.
9. **Storage/CDN budget owner** — not decided; relevant once real media
   volume/size estimates exist from Phase 1.
