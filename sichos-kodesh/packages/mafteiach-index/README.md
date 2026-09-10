# @sichos-kodesh/mafteiach-index

An indexer for [mafteiach.app](https://www.mafteiach.app/) — a community-run
reference site that catalogs the Rebbe's sichos/farbrengens with exactly the
breakdown this app needs: whether a sicha exists as **mugah** (Rebbe-edited)
text, **bilti mugah** (unedited hanacha), and/or a **recording** (audio via
[ashreinu.app](https://ashreinu.app), JEM's audio app — see
`docs/PLANNING.md` — or video via embedded YouTube), plus maamarim, English
translations, and mafteiach.app's own editorial content-outline
("תוכן ענינים") per occasion.

## Why scrape this instead of berel.me or lahak.org

Researched directly (see `docs/PLANNING.md`), not assumed:

- **berel.me/shabbosfarbrengens** is a real, maintained chart — but it's
  only ever exported as a print-sized PDF/PNG, with no underlying
  spreadsheet, CSV, JSON, or API. There's nothing to scrape; the actual
  data behind the chart is not published anywhere on the site.
- **lahak.org** returns HTTP 403 to a plain fetch and runs on Chabad.org's
  platform, whose `robots.txt` disallows most content sections and caps
  crawl rate. It's also the commercial rights-holder for the hanachos it
  publishes (has a shop selling exactly this content). Scraping it would be
  both technically blocked and a real rights problem, not just rude.
- **mafteiach.app**'s `robots.txt` has no restrictions at all, and its
  content is mostly *links out* (to Google Drive-hosted scans, to
  ashreinu.app, to YouTube) plus bibliographic citations (volume + page
  references into Toras Menachem / Likkutei Sichos) — i.e. mostly facts and
  pointers, not mafteiach.app hosting the copyrighted primary text itself.

That distinction matters for what this tool commits to the repo — see
"What's committed vs. generated locally" below.

## How the site actually works (reverse-engineered, not documented anywhere)

mafteiach.app serves both its year-listing and per-farbrengen-detail pages
as a JS snippet (`let html = "..."` followed by a DOM swap) rather than
plain HTML or JSON — apparently because the same partial backs both a full
page load and an in-page AJAX swap. `src/htmlLiteral.ts` extracts and
unescapes that string literal back into real HTML, which `src/parseListing.ts`
and `src/parseFragment.ts` then parse with `cheerio`.

Two non-obvious, verified-against-real-data behaviors this tool works around:

1. **Fake year pages.** Requesting `/all/by_year/{year}` for a year outside
   the site's real coverage doesn't 404 — it silently renders **5711**'s
   content instead. Brute-forcing every year from 5690 would produce
   confidently-wrong data. The real coverage (confirmed from the site's own
   sidebar nav) is: one combined bucket page for pre-Nesius years
   (`/all/by_year/5690_5710`, all flagged `isPreNesius`), plus standalone
   pages for 5710 through 5752. `REAL_STANDALONE_YEARS` and
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
an interruption, or after a parser bugfix, replays from cache instead of
re-hitting the site. It also sends an honest, identifying User-Agent
(the crawler's purpose and a contact point), not a browser impersonation.

## What's committed vs. generated locally

`data/` and `.cache/` are gitignored, deliberately — not because scraping
this site is against its rules (it isn't; see above), but because most of
mafteiach.app's per-occasion content is either (a) links/citations to
other sources' copyrighted text (fine to index — a citation isn't the text
itself), or (b) mafteiach.app's own written editorial summary
(`tochenInyanim`), which **is** their copyrightable expression, not a bare
fact. Committing thousands of those summaries verbatim into this public
repo without asking isn't something to do by default just because it's
technically fetchable. The crawler code, tests, and a handful of real
fixtures are committed so the dataset is fully reproducible; the dataset
itself is a local build artifact until there's an actual conversation with
mafteiach.app's maintainers about terms (the same outreach already planned
for Berel Marozov and JEM in `docs/PLANNING.md` — this is one more
conversation to have, not a blocker to indexing metadata for internal use).

## Known gaps / not yet modeled precisely

- `maamorim` link extraction is generic (same "nearest preceding heading"
  grouping as everything else); the real per-maamor structure is richer
  (maamor title, an internal `/maamorim/{id}` page, per-edition
  sub-sections) and could be modeled more precisely if maamarim become a
  first-class feature rather than secondary to sichos/farbrengens.
- `hagahos` (annotations/corrections) and `hosofos` (addenda) sections are
  parsed with the same generic link extractor but weren't verified against
  a real example with content (none turned up in the fixtures sampled) —
  treat as best-effort until spot-checked against the full crawl output.
- Some early (pre-Nesius) entries have `hebrewDate` ending in `-00` — an
  explicit "day unknown" placeholder in the source data, not a bug here.
