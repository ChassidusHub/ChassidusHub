# @sichos-kodesh/mafteiach-index

An indexer for [mafteiach.app](https://www.mafteiach.app/) — a community-run
reference site that catalogs the Rebbe's sichos/farbrengens with exactly the
breakdown this app needs: whether a sicha exists as **mugah** (Rebbe-edited)
text, **bilti mugah** (unedited hanacha), and/or a **recording** (audio via
[ashreinu.app](https://ashreinu.app), JEM's audio app, or video via embedded
YouTube), plus maamarim, English translations, and mafteiach.app's own
editorial content-outline ("תוכן ענינים") per occasion.

## Why scrape this instead of berel.me or lahak.org

- **berel.me/shabbosfarbrengens** is a real, maintained chart — but it's
  only ever exported as a print-sized PDF/PNG, with no underlying
  spreadsheet, CSV, JSON, or API. There's nothing to scrape; the data
  behind the chart isn't published anywhere on the site.
- **lahak.org** returns HTTP 403 to a plain fetch and runs on Chabad.org's
  platform, whose `robots.txt` disallows most content sections and caps
  crawl rate. It's also the commercial rights-holder for the hanachos it
  publishes (has a shop selling exactly this content). Scraping it would be
  both technically blocked and a rights problem, not just rude.
- **mafteiach.app**'s `robots.txt` has no restrictions at all, and its
  content is mostly *links out* (to Google Drive-hosted scans, to
  ashreinu.app, to YouTube) plus bibliographic citations (volume + page
  references into Toras Menachem / Likkutei Sichos) — i.e. mostly facts and
  pointers, not mafteiach.app hosting the copyrighted primary text itself.

That distinction matters for what this tool commits to the repo — see
"What's committed vs. generated locally" below.

## How the site works (reverse-engineered, not documented anywhere)

mafteiach.app serves both its year-listing and per-farbrengen-detail pages
as a JS snippet (`let html = "..."` followed by a DOM swap) rather than
plain HTML or JSON — apparently because the same partial backs both a full
page load and an in-page AJAX swap. `src/htmlLiteral.ts` extracts and
unescapes that string literal back into real HTML, which `src/parseListing.ts`
and `src/parseFragment.ts` then parse with `cheerio`.

Two behaviors this tool works around:

1. **Fake year pages.** Requesting `/all/by_year/{year}` for a year outside
   the site's real coverage doesn't 404 — it silently renders **5711**'s
   content instead. The real coverage is: one combined bucket page for
   pre-Nesius years (`/all/by_year/5690_5710`, all flagged `isPreNesius`),
   plus standalone pages for 5710 through 5752. `REAL_STANDALONE_YEARS` and
   `PRE_NESIUS_BUCKET_PATH` in `src/crawl.ts` encode this. The bucket's tail
   overlaps standalone 5710's entries by id, so `crawlAll` dedupes globally
   by farbrengen id rather than trusting per-page year boundaries.
2. **Adar month encoding.** Date keys are `{year}-{month}-{day}` with
   Tishrei-based month numbering (01=Tishrei ... 07=Nisan), but a leap
   year's Adar isn't numbered 06/07 the way `HDate`'s native numbering
   would — it's `06A` (Adar Rishon) / `06B` (Adar Sheini), keeping Nisan
   fixed at `07` year-round. `hebrewDate` is typed `string`, not a
   month-number tuple, specifically because of this — see `types.ts`.

## Data model

`FarbrengenRecord` = a listing entry (`id`, `hebrewYear`, `hebrewDate`,
`isPreNesius`, `occasionLabel`) plus its `FarbrengenDetail`: `biltiMugah`,
`mugah`, `maamorim`, `english` and `hagahos`/`hosofos` as link lists (each
link optionally tagged with the sub-heading it appeared under, e.g. "ליקוט"
/ "הנחה"); `audio` as ashreinu.app player links; `video` as embedded
YouTube ids; `tochenInyanim` as plain text. Full shapes in `src/types.ts`.

This lines up deliberately with the kvius-engine's `hasRecording(year,
occasionKey)` touchpoint (`packages/kvius-engine`): a `CatalogEntry` backing
that predicate can check `detail.audio.hasContent || detail.video.hasContent`
for "is there a recording" and `detail.mugah.hasContent` /
`detail.biltiMugah.hasContent` for the muga/hanacha distinction, per
occasion.

## Running the crawl

```
npm install
npm run crawl -- --delay-ms 700          # full site, ~3,400 entries, ~40 min
npm run crawl -- --out ./data --cache ./.cache
```

The fetcher (`src/httpClient.ts`) is rate-limited (default 750ms between
requests) and caches every raw response to disk by URL — re-running after
an interruption, or after a parser change, replays from cache instead of
re-hitting the site. It also sends an honest, identifying User-Agent
(the crawler's purpose and a contact point), not a browser impersonation.

## The database (`db.ts`) and keeping it up to date (`sync.ts`)

Flat per-year JSON files (what `crawl` produces) are fine for a one-off
dataset, but not for "does year Y have a recording for occasion X" queries
or for tracking what changed over time. `openDatabase()` builds a SQLite
store (via Node's built-in `node:sqlite` — experimental, but no
native-compile dependency) with one `occasions` row per farbrengen
(boolean columns for `has_mugah` / `has_bilti_mugah` / `has_audio` /
`has_video` / etc. for fast filtering), a normalized `links` child table
for the actual citation URLs, and `first_seen_at` / `last_changed_at` /
`etag` columns that back incremental sync:

```
npm run load-db                    # one-time: migrate an existing crawl's data/*.json into mafteiach.db
npm run sync                       # incremental refresh against the live site
```

`syncAll()` (`src/sync.ts`) re-checks every listing page (cheap, ~44
requests) to find occasions the site added or delisted, then revalidates
every currently listed occasion's detail fragment via conditional GET
(`If-None-Match`). A full sync is still ~3,400 requests, but nearly all of
them come back as a cheap `304` when nothing changed — only genuinely new
or edited occasions get re-parsed and written to the DB, and
`last_changed_at` is only bumped when the content actually differs
(`contentHash()` fingerprints everything but crawl bookkeeping).
`upsertRecord()` is the single write path both `load-db` and `sync` go
through, so the two never drift out of sync with each other. Delisted
occasions (in the DB but no longer on the live site) are surfaced in
`SyncResult.missingIds`, never auto-deleted; a human should look at why
before removing anything.

`syncAll` takes a `fetcher: RevalidatingFetcher` (the one method it needs
from `PoliteFetcher`) rather than constructing one itself, so its
new-id/changed/missing-id logic has unit tests (`tests/sync.test.ts`)
against a fake in-memory site instead of needing a live network call for
every test run — the actual ETag/304 mechanism is covered separately by
one real request pair against mafteiach.app, not by re-running the full
crawl in tests.

There's no cron/scheduler wired up here — `sync` is a command to run
periodically (weekly or monthly is plenty for an archive this static),
not something this package runs on its own.

## What's committed vs. generated locally

`data/` and `.cache/` are gitignored, deliberately — not because scraping
this site is against its rules (it isn't; see above), but because most of
mafteiach.app's per-occasion content is either (a) links/citations to
other sources' copyrighted text (fine to index — a citation isn't the text
itself), or (b) mafteiach.app's own written editorial summary
(`tochenInyanim`), which **is** their copyrightable expression, not a bare
fact. Committing thousands of those summaries verbatim into this public
repo without asking isn't something to do by default just because it's
technically fetchable. The crawler code, tests, and a handful of fixtures
are committed so the dataset is fully reproducible; the dataset itself is
a local build artifact until there's an actual conversation with
mafteiach.app's maintainers about terms.

## What the parser captures

Every `farbrengen-detail-button` class across the full crawled corpus maps
to one of 11 fields on `FarbrengenDetail`, with two shapes worth calling
out specifically:

1. **Video has two distinct shapes.** A `sicha_video-button` embeds a
   YouTube player (`addYouTubeEmbed(id, ...)`) — but roughly a quarter of
   video-bearing occasions instead use a plain outbound `<a class="...
   video-button button">`, exactly like `audio`. Real hosts:
   `videos.jem.tv`, `drive.google.com`, `www.chabad.org` (its "Living
   Torah" player), `jemtv.page.link`, `jem.tv`, `player.vimeo.com`, and a
   legacy `www.770live.com`. `VideoSection` has a `links: LinkRef[]` field
   alongside `youtubeIds` — `hasContent` is true if either is non-empty.
2. **Pre-Nesius entries (`isPreNesius: true`) use a reduced 3-button
   template**, not the usual 9: only `biltiMugah` (labeled "הנחות," always
   disabled), `mugah` (labeled "רשימות" / Reshimos — diary-style notes, not
   an edited sicha, but rendered with the *same* CSS class as a
   post-Nesius מוגה, so it lands in the same field), and `hosofos`. The
   semantic meaning of `mugah` for a pre-Nesius record therefore differs
   from a post-Nesius one — documented on `FarbrengenDetail` in `types.ts`,
   and a caller that cares about the distinction should branch on
   `isPreNesius`.

Full-corpus stats (3,424 total occasions, 5690-5752):

| Has... | Count | % |
|---|---|---|
| Bilti-mugah (hanacha) text | 3,067 | 90% |
| Content-outline (mafteiach's own summary) | 2,723 | 80% |
| Mugah text (or Reshimos, pre-Nesius) | 2,011 | 59% |
| Maamorim | 1,544 | 45% |
| **Any recording (audio or video)** | **1,314** | **38%** |
| Hagahos | 1,287 | 38% |
| Audio | 1,303 | 38% |
| — via ashreinu.app | 1,303 | 38% |
| Video | 671 | 20% |
| — via embedded YouTube | 518 | 15% |
| — via a direct outbound link | 153 | 4% |
| English translation | 1,245 | 36% |
| Hosofos | 309 | 9% |

(The "any recording" total, 1,314, is barely above the audio-only total of
1,303 despite video adding 671 — almost every video-bearing occasion also
has audio, so the union grows by only 3 net for the direct-outbound-link
video occasions, and by 13 net overall.)

No button classes exist anywhere in the corpus beyond the 11 accounted for
above.

## Known gaps / not yet modeled precisely

- `maamorim` link extraction is generic (same "nearest preceding heading"
  grouping as everything else); the real per-maamor structure is richer
  (maamor title, an internal `/maamorim/{id}` page, per-edition
  sub-sections) and could be modeled more precisely if maamarim become a
  first-class feature rather than secondary to sichos/farbrengens.
- Some early (pre-Nesius) entries have `hebrewDate` ending in `-00` — an
  explicit "day unknown" placeholder in the source data, not a bug here.

## What this doesn't cover (mafteiach.app has more than farbrengens)

This package only crawls `/all/by_year/...` (and the two alternate views
`/all/moadim/...` / `/all/parshiyos/...`, which are the *same* farbrengen
ids re-grouped by holiday/parsha, not new content — not worth crawling
separately). The site has real additional sections this package does not
touch at all:

| Section | URL pattern | id space | Page shape |
|---|---|---|---|
| Likkutei Sichos | `/likkutei_sichos/by_volume/{n}` (also `by_parsha`, `by_moad`) | its own per-sicha ids (e.g. `/likkutei_sichos/{id}/kitzur`) | full server-rendered HTML per volume, not the JS-fragment pattern; every sicha listed inline (no per-item AJAX fetch needed) |
| Maamorim (standalone index) | `/maamorim` | small sequential ids via `loadMaamorFragment(event, id)`, distinct from farbrengen ids | same JS-fragment pattern as farbrengens |
| Hadranim | `/hadranim/by_masechta` (also `by_year`) | not yet mapped | full server-rendered HTML, same family as Likkutei Sichos |
| General letters | `/michtavim_klolim_new/by_moed` (also `by_year`) | not yet mapped | full server-rendered HTML; per-letter tabs look like farbrengens (מוגה/English/תוכן ענינים) |
| Diaries (yomanim) | `/yomanim/by_year` | not yet mapped | full server-rendered HTML |

Extending to these is a real option (the same politeness/caching approach
would apply directly), but **Likkutei Sichos specifically needs a more
careful line than farbrengens did**: it's Rabbi Schneerson's actively
published, currently-sold book series, not archival hanachos. Indexing
bibliographic facts (volume/sicha number, parsha, page range, kitzur/
English/mugah *availability flags*, links) is the same category of thing
already done for farbrengens — but before storing any "teaser" text
alongside it, it needs to be determined which of that text is mafteiach.app's
own editorial writing (safe, like `tochenInyanim`) versus a direct excerpt
of the copyrighted sicha itself (not safe to bulk-store). That
determination hasn't been made yet, so no Likkutei Sichos crawler has been
built pending it.
