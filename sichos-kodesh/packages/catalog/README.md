# @sichos-kodesh/catalog

Joins `packages/mafteiach-index`'s crawled dataset into the small,
app-facing `CatalogEntry` shape the mobile app actually needs, and bridges
`packages/kvius-engine`'s abstract `occasionKey` scheme (`"week:N"`,
`"yud-shevat"`, etc.) to mafteiach-index's concrete per-date records.

## Why this exists

The engine's `hasRecording(hebrewYear, occasionKey) -> boolean` touchpoint
(see `kvius-engine`'s README) is deliberately abstract — it has no idea
what a "recording" is, or which Hebrew date `"week:12"` actually falls on
in a given year (that's only stable *across* kvius-matched years, not a
fixed date). Something has to bridge that gap to the real crawled data.
That's this package.

## The date-key bridge (`hebrewDateKey.ts`)

kvius-engine's `HebrewDateParts.month` uses `@hebcal/core`'s native HDate
numbering (1=Nisan...7=Tishrei...12=Adar/Adar I...13=Adar II). Mafteiach-
index's `hebrew_date` string keys use a different, Tishrei-based
convention (01=Tishrei...05=Shevat...07=Nisan...12=Elul, with a leap
year's Adar split into "06A"/"06B" rather than shifting later months).
`toMafteiachHebrewDateKey()` converts between them — verified directly
against `@hebcal/core`'s real output and the actual crawled dataset (Yud
Shevat 5711 → `"5711-05-10"`, real leap-year Adar I/II entries →
`"5711-06A-*"` / `"5711-06B-*"`), not just reasoned about.

## Resolving occasion keys (`catalogLookup.ts`)

`findCatalogEntryForOccasion(catalog, hebrewYear, occasionKey, il, fixedOccasions)`:
- `"week:N"` → that year's own `buildWeeklySchedule` entry for week `N`,
  converted to a mafteiach date key.
- any other key → looked up in the supplied `FixedOccasionDef[]` (see
  `fixedOccasions.ts`) and resolved via `buildFixedDateSchedule` the same
  way.

This has to handle **arbitrary candidate years**, not just the target
year — the engine's gap-handling machinery calls `hasRecording` for every
kvius-matched fallback candidate, so "which date is `occasionKey` in *this*
year" must be re-resolved per year, not cached from the target year.

`hasContent(catalog, il, fixedOccasions)` is the predicate this package
supplies for that touchpoint — named `hasContent`, not `hasAudio`: an
entry with PDFs but no audio counts as real content, not a gap. This is a
real, verified case, not a hypothetical — Nitzavim/Vayeilech (the last
Shabbos before Rosh Hashana) regularly has mugah/bilti-mugah PDF
transcripts with zero JEM audio across every kvius-matched year checked.
Gating on audio alone would hide real, downloadable PDFs behind a "no
recording" gap message.

`fixedOccasions.ts` ships a small **starter** list (Yud-Tes Kislev, Yud
Shevat, Purim, Lag BaOmer, Yud-Beis Tammuz, Chai Elul, Simchas Torah —
Diaspora dates only for now) — deliberately not exhaustive. Without it,
Screen 2 would only ever be able to show Shabbos-anchored occasions, and
several of the most iconic farbrengens are weekday-anchored.

## This week's occasions (`resolveThisWeek.ts`)

`resolveThisWeek(sourceYear, catalog, today?)` returns every occasion with
real content (audio or a PDF) anywhere in the current Hebrew week (Sunday
through Shabbos) — not just the closest Shabbos. Farbrengens happen on
weekdays as often as on Shabbos (Yud-Tes Kislev, Yud Shevat, Erev Rosh
Hashana...), so an earlier Shabbos-only version of this was hiding most of
a typical week's real content.

It doesn't use the `occasionKey`/`FixedOccasionDef` machinery above at all:
two kvius-matched years share an identical month-length pattern (that's the
definition of a kvius match), so a given Hebrew (month, day) always falls
the same number of days after Tishrei 1 — and therefore on the same weekday
— in both years. This week's dates translate into `sourceYear` by reusing
the same month/day values directly, then looking each one up in the
catalog. The one exception: a day that rolls into the *next* Hebrew year
(the week containing Rosh Hashana) has no well-defined match in
`sourceYear`, since kvius matching is per-year — those days are skipped
rather than mismatched.

## Display helpers for a browsed year and a PDF section (`mafteiachMonth.ts`, `pdfSections.ts`)

`mafteiachMonthName(hebrewDate)` names a raw mafteiach-index date key's
month (Tishrei..Elul, splitting a leap year's Adar I/Adar II) - used by
both apps to group a browsed year's occasion list under month headers
instead of one long flat list.

`PDF_SECTION_ORDER` / `PDF_SECTION_LABELS` give a display order and short
label for each `PdfSection` (mugah, biltiMugah, maamorim, hagahos,
hosofos) - both apps group an occasion's PDFs under a category header per
section, since several real labels are short and generic on their own
(hagahos's "צילום 1"/"צילום 2" - literally "scan 1"/"scan 2", real site
text, not a bug) and only make sense next to a header saying what they're
scans *of*.

`browsableYears(catalog)` lists every year with real content for the
"Browse any year" screen, floored at `MIN_HISTORICAL_YEAR` (5710, the same
floor `kvius-engine` already uses for candidate-year matching): this app is
scoped to the current Rebbe's own sichos, not the Previous Rebbe's
pre-Nesius farbrengens, so a bundled year file before 5710 is never
reachable and isn't built at all (see `bin/build.ts`). Reshimos exclusion
is unrelated and unconditional - a link-level filter (`isReshimosLabel`),
not a date one.

## Preferred printed edition (`pdfEdition.ts`)

mugah/biltiMugah/maamorim/hosofos occasions have PDFs citing one of three
real, distinct hanachos (transcripts) - not variants of each other, so
conflating them is a real bug, not a simplification: **Sichos Kodesh**
(שיחו"ק - the original, less-edited yearly transcripts this app is named
for, and by far the largest series in the real data, e.g. 2,446 of
biltiMugah's citations), the **Sefer** family (סה"ש - Sefer HaSichos, סה"מ
- Sefer HaMaamarim), and **Toras Menachem** (תו"מ). `classifyPdfEdition(label)`
detects which (a label can cite more than one, e.g. "סה"ש/ תו"מ
התוועדויות"); `sortPdfsByEditionPreference(pdfs, preference)` stable-sorts a
section's PDFs so ones matching the user's stored preference come first,
without hiding the rest - real citation variety is part of what this
dataset is for, a preference just picks what shows up first.

## Building the catalog (`buildCatalog.ts` / `bin/build.ts`)

Reads `packages/mafteiach-index`'s `occasions` / `links` / `jem_audio`
tables directly (schema in that package's `src/db.ts`) and emits one
`CatalogEntry` per occasion:
- `audio`: already-resolved JEM recordings from `jem_audio`, one entry per
  chapter (a farbrengen is usually several separate recordings, not one -
  a few sichos, a maamar, niggunim between them), in real chapter/playback
  order with an optional `chapterName` (ccdb's own names, e.g. "Sicha 1",
  "Ma'amar", "Nigun 1") - see `packages/mafteiach-index`'s `jemAudio.ts` for
  how the recordings themselves are resolved. Filename extracted from the
  CloudFront URL for `services/media-proxy`'s `/jem-audio/:filename` route.
- `pdfs`: Drive file ids extracted (`driveLinks.ts`) from the
  `mugah`/`biltiMugah`/`maamorim`/`hagahos`/`hosofos` link sections, for
  `/drive/:fileId`.

An occasion with neither is still included with empty arrays — a real gap,
not a silently dropped row. `bin/build.ts` only writes year files at or
above `MIN_HISTORICAL_YEAR` (5710) - see `browsableYears` above.

```
npm run build
npm run build-catalog -- --db ../mafteiach-index/mafteiach.db --out ./data
```

Verified against the real crawl: 3,424 occasions total, 43 bundled year
files (5710-5752); e.g. Yud Shevat 5711 correctly comes out with its 4 real
resolved audio chapters, in order (Sicha 1, Sicha 2, Ma'amar, Sicha 3) and
8 real Drive PDF links.

## What's bundled into the app vs. fetched live

Only bibliographic metadata is ever in the generated JSON — dates, short
factual labels, Drive file ids, JEM filenames. Never the actual
copyrighted text or audio bytes, which stay server-fetched on demand
through `services/media-proxy`. This is the same "a citation isn't the
cited work" line `packages/mafteiach-index` draws for what it commits.
