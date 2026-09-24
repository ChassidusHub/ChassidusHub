# @sichos-kodesh/catalog

Joins `packages/mafteiach-index`'s crawled dataset into the small,
app-facing `CatalogEntry` shape the apps consume, and bridges
`packages/kvius-engine`'s abstract `occasionKey` scheme (`"week:N"`,
`"yud-shevat"`, etc.) to mafteiach-index's concrete per-date records.

kvius-engine's `hasRecording(hebrewYear, occasionKey) -> boolean` touchpoint
is deliberately abstract: it has no idea what a "recording" is, or which
Hebrew date `"week:12"` falls on in a given year (that's only stable
*across* kvius-matched years, not a fixed date). This package is that
bridge to the real crawled data.

## Data model (`types.ts`)

- `CatalogEntry`: one occasion — `occasionId`, `hebrewYear`, `hebrewDate`
  (mafteiach-index's raw date key, e.g. `"5711-05-10"`), `occasionLabel`,
  optional `occasionLabelEn` (see "Display translations" below),
  `audio: CatalogAudio[]`, `pdfs: CatalogPdf[]`.
- `CatalogAudio`: `workerFilename` (for `services/media-proxy`'s
  `/jem-audio/:filename` route), `durationMs`, optional `chapterName` and
  its Hebrew, optional `chapterNameHe`.
- `CatalogPdf`: `section` (`PdfSection`), `label`, `driveFileId` (for
  `/drive/:fileId`), optional `resourceKey`.
- `PdfSection`: `'mugah' | 'biltiMugah' | 'maamorim' | 'hagahos' | 'hosofos'`.
- `CatalogYear`: one bundled JSON file's shape (`CatalogEntry[]`).
- `CatalogByYear`: `Record<number, CatalogEntry[]>`, the in-memory shape
  most of this package's functions operate on.

Only bibliographic metadata is ever in the generated JSON — dates, short
factual labels, Drive file ids, JEM filenames. The actual copyrighted
text/audio bytes stay server-fetched on demand through
`services/media-proxy`.

## Building the catalog (`buildCatalog.ts`, `bin/build.ts`)

`buildCatalog(db)` reads `packages/mafteiach-index`'s `occasions` / `links`
/ `jem_audio` tables (schema in that package's `src/db.ts`) and returns one
`CatalogEntry` per occasion, grouped by Hebrew year and sorted by
`hebrewDate` then `occasionId`:

- `audio`: already-resolved JEM recordings from `jem_audio`, one per
  chapter, in chapter/playback order, with the JEM CloudFront filename
  extracted from the URL and an optional `chapterName` (ccdb's own label,
  e.g. `"Sicha 1"`, `"Ma'amar"`).
- `pdfs`: Drive file ids extracted (`driveLinks.ts`) from the
  `mugah`/`biltiMugah`/`maamorim`/`hagahos`/`hosofos` link sections.
  Reshima-labeled links (`isReshimosLabel`) and non-Drive links are
  dropped.

An occasion with neither audio nor a PDF is still included, with empty
arrays — a genuine gap, not a silently dropped row.

Each entry also gets `occasionLabelEn` and each named recording
`chapterNameHe` when the display translators can produce them (next
section).

## Display translations (`translate/`)

mafteiach.app labels its occasions in Hebrew and JEM names its recordings
in English, so each UI language would otherwise show the two mixed. The
catalog build adds the missing language next to each, and the apps show
each UI language its own (`occasionTitle` / `chapterTitle` in
packages/app-core):

- `translateOccasionLabel(label)` (`translate/occasionLabelEn.ts`): Hebrew
  occasion label -> English, e.g. `יום ב' דר"ה` -> "Rosh Hashanah, day 2",
  `מוצאי י"ג תשרי` -> "Motzei 13 Tishrei", `בראשית, מבה"ח וער"ח מ"ח` ->
  "Bereishis, Shabbos Mevarchim and Erev Rosh Chodesh Cheshvan". The label
  is split where it splits itself (commas, " - ", parentheses), and every
  part must be one the rules read: a date (Hebrew numerals, including
  Chabad's יו"ד and ז"ך), a parsha, a Yom Tov and its numbered day or
  night, Rosh Chodesh and Shabbos Mevarchim, a time of day, or who a sicha
  was said to, chunk by chunk from `translate/occasionDictionary.ts`.
- `translateChapterName(name)` (`translate/chapterNameHe.ts`): JEM chapter
  name -> Hebrew, e.g. "Sicha 1" -> "שיחה א׳", "Two Nigunim" -> "שני
  ניגונים", "Sicha, Yud Zayin Tishrei, 5748" -> "שיחה, י״ז תשרי, תשמ״ח",
  from `translate/chapterDictionary.ts`.

Both are pure, deterministic rules - no network, nothing learned at run
time - and return `null` rather than guess: a label with one part the rules
do not know gets no English, and the UI keeps the original. Only labels are
translated, never mafteiach's editorial writing. Ashkenazi (Chabad)
pronunciation throughout, the app's own month names (mafteiachMonth.ts),
and the Hebrew UI's geresh and gershayim (׳ ״).

`npm run translation-coverage -w @sichos-kodesh/catalog -- --db <mafteiach.db>`
reports how much of the catalog each covers and lists what is left; from
the 2026-09-24 crawl that is 1,438 of 1,454 distinct occasion labels
(3,314 of 3,330 occasions) and 783 of 785 chapter names. The leftovers are
names the rules cannot spell with confidence (visitors known only by
initials, an unknown abbreviation), a label whose parentheses do not
balance, and two pieces of editorial text. `tests/translatedCatalog.test.ts`
fails when the bundled year files are not what the current rules produce -
after changing a dictionary, rebuild the catalog.

`bin/build.ts` runs `buildCatalog` against a SQLite database and writes one
JSON file per Hebrew year at or above `MIN_HISTORICAL_YEAR` (5710, see
`browsableYears` below) into an output directory, plus an `index.ts` barrel
file that statically imports each year — Metro (React Native's bundler)
only bundles statically-analyzable imports, not a runtime-computed list of
filenames, so this barrel is what `apps/mobile` actually imports.

```
npm run build
npm run build-catalog -- --db ../mafteiach-index/mafteiach.db --out ./data
```

## The works (`works/`, catalog schema 3 - the phone app only)

The Rebbeim and their seforim (`docs/chabad-library-plan.md`, section 5),
built by `packages/works` (`npm run build-catalog-works -w
@sichos-kodesh/works`) from its registry and the importers' output
(`packages/sefaria-index`). This package owns the format:

- `CatalogWorksIndex`: every author and work. Each work lists its sources,
  each with the rights the works gate decided (`ship`, `ship-with-credit`,
  `link-only`). A work the library already holds names its `collection`,
  and its units are that collection's items.
- `CatalogWorkContents`: an imported work's contents (its parts, in order)
  and its units. Each unit's editions point at a source by index and, when
  the text may ship, carry its text object's sha256.
- `parseCatalogWorks` validates a fetched file. `worksRightsProblems` lists
  any text kept for a source that may not ship, and any local-only source.
  The build and `bin/release.ts` both refuse such works.
- `unitsInOrder`, `catalogWork`, `catalogUnit`, `worksByAuthor` and
  `editionSource` are the lookups.

The phone bundles `apps/mobile/src/catalog/data/works/`:
- `works.json`, read on first use (not `index.json`: Metro would resolve
  the folder to it before `index.ts`);
- one `contents/<work>.json` per imported work, read when that work is
  opened.

## The library (`library/`, catalog schema 2 - the phone app only)

Everything beyond the dated farbrengens, for the phone app's library
browsers. `buildLibrary(maf, jem)` reads the section tables
`packages/mafteiach-index`'s section crawler fills (and, for JEM events,
`packages/jem-index/jem.db`) and returns a `CatalogLibrary`:

- `moadim` (mafteiach's 101 moadim and yemei d'pagra, Hebrew names, the
  farbrengen occasions each lists) and `parshiyos` (53) - mafteiach's own,
  curated grouping, which the phone's search moves to (WP4b) from the
  hand-made `SPECIAL_DAYS` / `CHAG_CATEGORIES` and the date math. Those
  stay as they are here: the web app still uses them.
- `collections`: `likkuteiSichos`, `maamorim`, `yomanim`, `hadranim`,
  `michtavimKlolim`, `reshimos`, `jemEvents`. Every item has `id`,
  `label`, optional `hebrewYear` / `hebrewDate` and the same `refs`
  (`CatalogRef`: a Drive PDF by `driveFileId`, a JEM recording by
  `workerFilename`), so downloads, packs and search stay generic; each
  collection adds its own fields and browse axes in `groups` (Likkutei
  Sichos by volume, parsha and moed, with the 34 sichos of "חלק מ" in
  `supplement` and flagged `supplement: true`, since that book is Vaad
  L'hafotzas Sichos' disputed 5781 supplement, not one of the 39 volumes;
  maamorim by year and Melukat volume;
  hadranim by masechta and year; michtavim by moed and year; JEM events by
  year and type).

Only bibliographic facts, flags and links - never mafteiach's editorial
writing (see packages/mafteiach-index's README). `lookup.ts` has the
reverse indexes (`occasionMoadim`, `occasionParshiyos`, `libraryItem`),
`parse.ts` validates a fetched library.

`bin/build.ts` writes it next to the year files, as `data/library/`: one
JSON file per collection plus `meta.json` (moadim, parshiyos), and an
`index.ts` whose default export reads them on first call - Metro bundles
every file a literal `require` names, and a `require` inside a function
only parses its JSON when called, so the library costs the phone nothing
at start-up. `--jem-db` (default `packages/jem-index/jem.db`, skipped when
absent) and `--without-jem` control the jemEvents collection. Copy
`data/library/` into `apps/mobile/src/catalog/data/` only; the web app
does not bundle it.

From the first full sections crawl (2026-09-24) the library holds:

| Collection | Items |
| --- | --- |
| likkuteiSichos | 2,262 (2,228 in the 39 volumes, 34 in the "חלק מ" supplement) |
| maamorim | 1,568 |
| yomanim | 2,890 |
| hadranim | 144 |
| michtavimKlolim | 193 |
| reshimos | 38 |
| jemEvents | 2,909 |

It also holds 101 moadim and 53 parshiyos. That is 4.0 MB of JSON, 0.7
MB gzipped. The phone's Hermes bytecode grows by 1.6 MB, 0.7 MB
compressed, and the schema-2 catalog.json is 6.4 MB.

## Gated collections (`rights.ts`, `library/gated.ts`)

`SHIPPABLE_COLLECTIONS` says which collections may leave the machine they
were built on, meaning bundled in an app, released in a catalog, or put in
a pack. Every collection mafteiach and JEM index ships. The Igros and
Maanos do not: their text comes from a commercial app's data files, so they
stay local until Shmuly clears the rights with its publisher. Flipping them
to `true` is that decision.

- `build-catalog --igros <dir>` turns `packages/igros-index`'s output into
  the `igros` and `maanos` collections. They have the library's item shape,
  with one `text` ref each. They are written to `<out>/library-gated/`,
  never into `library/`. The command refuses an `--out` inside `apps/`.
- `parseCatalogLibrary` rejects a library that carries either collection.
- `release-files` refuses a library folder that holds `igros.json` or
  `maanos.json`, so no release can include them.
- The pack builder (WP3) reads the same table.

## Catalog releases (`version.ts`, `changelog.ts`, `release.ts`, `bin/release.ts`)

The catalog data has its own version, changelog and release tags,
separate from the two apps' versions: the apps bundle one copy of the
data (their `src/catalog/data`, built as above) but fetch a newer one
from `api.sk.shmuky.dev` on their own, so a corrected date or a re-crawl
reaches every phone without an app update.

- `CATALOG_VERSION` (`version.ts`) is the version of the shipped data;
  `CATALOG_SCHEMA_VERSION` is the shape of it, bumped only for a change
  that would break an older app's parsing (an app never applies data of
  another schema version - it keeps its bundled copy).
  `CATALOG_LIBRARY_SCHEMA_VERSION` (2) is the same farbrengens plus the
  library, and `CATALOG_WORKS_SCHEMA_VERSION` (3) adds the works: the
  phone runs on 3 from mobile 1.5.0. All three schemas are released
  together, under one `CATALOG_VERSION`:
  - `/v1/` for the web;
  - `/v2/` for phones up to 1.4.0;
  - `/v3/` for the phone from 1.5.0.
- `CATALOG_CHANGELOG` (`changelog.ts`, en + he) is the machine-readable
  changelog the apps show under "Catalog" on their About screens;
  `CHANGELOG.md` is the human copy. Keep both in step.
- `release.ts` is the contract with the API: `CatalogManifest`
  (`/v1/catalog/manifest.json` - version, size, SHA-256, years, changelog,
  and the URL of the data) and `CatalogRelease`
  (`/v1/catalog/<version>/catalog.json` - the data itself, self-describing).
  `parseCatalogManifest` / `parseCatalogRelease` validate a fetched file;
  `isCatalogUpdateApplicable` decides whether an app should fetch it.
- `bin/release.ts` (`npm run release-files -w @sichos-kodesh/catalog`)
  writes the two files into `dist-release/` from the year files the apps
  bundle (and fails if the two apps' copies differ), and, from the
  library the phone bundles, `dist-release/v2/{catalog,manifest}.json`
  (schema 2, the manifest with `collections` counts). From the works it
  bundles, it writes `dist-release/v3/{catalog,manifest}.json` (schema 3,
  the manifest also counts `works`). It also writes `dist-release/parts/`:
  the farbrengens', the library's and the works' JSON, which
  services/catalog-api keeps one copy of. `serializeCatalogRelease`,
  `serializeLibraryRelease` and `serializeWorksRelease` build each
  catalog.json byte for byte like `JSON.stringify`. `--check` only verifies the version/changelog agree
  (CI); `--released-at` pins the timestamp (the API passes the commit's
  date).

How the API gets the files: `api.sk.shmuky.dev` is
`services/catalog-api`, a Vercel project whose build runs this same
`release-files` script against the checked-out commit and bakes the two
files into the function. There is no upload step and no bucket: the
release it serves is the catalog of whatever commit is deployed to
production, i.e. `main`. (`services/catalog-api/README.md` has the
endpoints and the Vercel settings.)

To ship a catalog release:

1. Rebuild the data (`build-catalog` above) and copy the year files into
   both apps' `src/catalog/data` (they are identical copies), and
   `data/library/` into `apps/mobile/src/catalog/data/` only. For the
   works, run the importers, then `build-catalog-works` (it writes
   `apps/mobile/src/catalog/data/works/` directly).
2. Bump `CATALOG_VERSION`, add the entry to `changelog.ts` and
   `CHANGELOG.md`.
3. Merge to `main`. Vercel deploys the API from that commit; the apps pick
   the new version up on their next daily check (or "Update catalog" on
   the phone).
4. Tag the same commit `catalog-v<version>` and push the tag. The
   `catalog-release` workflow (`.github/workflows/catalog-release.yml`)
   runs `release-files` and attaches `catalog.json` + `manifest.json` (and
   the schema-2 and schema-3 pairs as `catalog-v2.json` + `manifest-v2.json`
   and `catalog-v3.json` + `manifest-v3.json`) to a
   GitHub release of that tag - the archive of what the API serves.

## Playback policy (`playbackPolicy.ts`)

`CatalogAudio.kind` marks a recording that is not the Rebbe's own voice
(`'shiur'`, `'chazara'`); absent means the Rebbe's farbrengen recording.
`isPlaybackRateAllowed(audio)` is the one rule both players follow: a
speed control (`PLAYBACK_RATES`) exists only for a shiur or a chazara; the
Rebbe's recordings always play at 1×, and neither app shows a speed
control for them.

## Resolving occasion keys (`catalogLookup.ts`)

`findCatalogEntryForOccasion(catalog, hebrewYear, occasionKey, il, fixedOccasions)`:
- `"week:N"` → that year's own `buildWeeklySchedule` entry for week `N`,
  converted to a mafteiach date key.
- any other key → looked up in the supplied `FixedOccasionDef[]` and
  resolved via `buildFixedDateSchedule`.

This re-resolves the date per call rather than caching from one year,
because kvius-engine's gap-handling calls `hasRecording` for arbitrary
candidate years, not just the target year.

`entryHasContent(entry)` / `hasContent(catalog, il, fixedOccasions)`: true
when an entry has real, downloadable content (audio or a PDF), not just a
bibliographic record. Named for content, not audio, because an entry with
PDFs but no audio still counts — e.g. Nitzavim/Vayeilech (the last Shabbos
before Rosh Hashana) regularly has PDF transcripts with no JEM audio.
`hasContent` is the `hasRecording` predicate this package supplies to
kvius-engine's gap resolution.

`browsableYears(catalog)` lists every year at or above `MIN_HISTORICAL_YEAR`
with at least one entry that has content, for a "browse any year" screen —
unlike `findMatchingYears`, not constrained to kvius-matched years.

## Fixed-date occasions (`fixedOccasions.ts`)

`STARTER_FIXED_OCCASIONS` is a small starter list of well-known fixed-date
farbrengens (Yud-Tes Kislev, Yud Shevat, Purim, Lag BaOmer, Yud-Beis
Tammuz, Chai Elul, Simchas Torah — Diaspora date), deliberately not
exhaustive (every Yom Tov and Rosh Chodesh is future work). Without it, the
weekly-schedule-only view would miss several of the most iconic
farbrengens, which fall on weekdays as often as not.

## This week's occasions (`resolveThisWeek.ts`)

`resolveThisWeek(sourceYear, catalog, today?)` returns every occasion with
content anywhere in the current Hebrew week (Sunday through Shabbos), not
just the closest Shabbos — farbrengens happen on weekdays as often as on
Shabbos (Yud-Tes Kislev, Yud Shevat, Yud-Beis Tammuz...).

It doesn't use the `occasionKey`/`FixedOccasionDef` machinery: two
kvius-matched years share an identical leap status and month-length
pattern, so a given Hebrew (month, day) always falls the same number of
days after Tishrei 1, and therefore on the same weekday, in both years.
This week's dates translate into `sourceYear` by reusing the same
month/day values directly, then looking each one up in the catalog. A day
that rolls into the *next* Hebrew year (the week containing Rosh Hashana)
is skipped rather than mismatched.

`resolveWeekWithFallback(preferredYear, targetYear, catalog, today?)` tries
`resolveThisWeek(preferredYear, ...)` first, then every kvius-matched year
(full match preferred over a partial week-only match), returning `null`
only if nothing in the fallback chain has content.

`resolveThisWeekAllYears(catalog, today?)` and
`resolveOccasionAllYears(catalog, sourceHebrewDate)` answer a different
question: not "what falls in this week in a kvius-matched year," but "what
falls on these Hebrew dates across every indexed year," kvius-matched or
not — grouped by year, earliest first.

## Hebrew date key conversion (`hebrewDateKey.ts`)

kvius-engine's `HebrewDateParts.month` uses `@hebcal/core`'s native HDate
numbering (1=Nisan...7=Tishrei...12=Adar/Adar I...13=Adar II).
mafteiach-index's `hebrew_date` string keys use a different, Tishrei-based
convention (01=Tishrei...05=Shevat...07=Nisan...12=Elul, with a leap year's
Adar split into `"06A"`/`"06B"` rather than shifting later months).
`toMafteiachHebrewDateKey(parts)` converts kvius-engine's date parts into
that string key; `mafteiachMonthTokenToHDateMonth(token)` converts back.

## Drive links (`driveLinks.ts`)

`extractDriveFileId(url)` handles both real drive.google.com URL shapes:
`/file/d/{fileId}/view` and `open?id={fileId}` (or the equivalent
`uc?...&id={fileId}` download-link shape). Other hosts (chabad.org,
sie.org, YouTube, ...) return `null`.

`extractDriveResourceKey(url)` extracts a `resourcekey=` query param,
present on links shared before Google's 2021 resource-key change. It must
be forwarded to `services/media-proxy`'s `/drive/:fileId`, or the file
404s/redirects to a Google sign-in page even though it's genuinely public.

`isReshimosLabel(label)` matches a "reshima" (רשימה) — the Rebbe's private
notes, or the separately published "Reshimos" series — a different genre
from the farbrengen sichos/maamarim this app is scoped to. It filters PDF
*link labels* only, not occasion labels, since the same Hebrew root also
means the mundane "list" at the occasion-label level.

## Display helpers

- `mafteiachMonth.ts`: `mafteiachMonthToken`/`mafteiachDay` parse a raw
  mafteiach-index date key; `mafteiachMonthName`/`mafteiachMonthNameHebrew`
  give display names; `MAFTEIACH_MONTH_OPTIONS` is one canonical entry per
  real month (Tishrei-first, Adar/Adar I merged, Adar II separate) for a
  month filter.
- `pdfSections.ts`: `PDF_SECTION_ORDER` and `PDF_SECTION_LABELS` give a
  display order and short label (e.g. "Mugah (edited)") for each
  `PdfSection`.
- `pdfEdition.ts`: `classifyPdfEdition(label)` detects which of three
  printed series a PDF label cites — Sichos Kodesh (שיחו"ק), the Sefer
  family (סה"ש/סה"מ), Toras Menachem (תו"מ) — a label can cite more than
  one. `sortPdfsByEditionPreference(pdfs, preference)` stable-sorts a
  section's PDFs so a user's preferred edition comes first, without hiding
  the rest.
- `farbrengenContent.ts`: `isHighlightedFarbrengenHanacha(pdf)` identifies
  a farbrengen's primary content — its own Toras Menachem or Sichos Kodesh
  biltiMugah hanacha, not the later mugah edit, the maamar, or an unrelated
  biltiMugah citation (letters, memorial booklets, etc.).

## Search filters

- `occasionChag.ts`: `CHAG_CATEGORIES` groups hebcal's per-event
  descriptions into a coarse, search-friendly list (Rosh Hashana, Yom
  Kippur, Sukkot, Chol HaMoed Sukkot, Shmini Atzeret, Simchat Torah,
  Pesach, Chol HaMoed Pesach, Shavuot). `occasionChagCategory(hebrewDate, il)`
  resolves an occasion's own date to one of these, if any.
- `occasionParsha.ts`: `occasionParsha(hebrewDate, il)` resolves an
  occasion's date to the parsha of the Shabbos it falls on or before (two
  entries for a doubled reading, `null` on a chag).
- `specialDays.ts`: `SPECIAL_DAYS` is a curated list of recurring
  non-Shabbos, non-Yom-Tov dates worth their own filter (yahrzeits,
  birthdays, and historic geula/redemption days for the Rebbeim).
  `occasionSpecialDay(hebrewDate, occasionLabel)` matches an occasion to
  one, by exact date or by one day either side when the label marks it as
  "ערב" (eve of) or "מוצאי" (the night concluding).

## Today's date

- `currentHebrewYear.ts`: `currentHebrewYear()` — today's Hebrew year.
- `currentParsha.ts`: `currentParsha(il, today?)` — the parsha for the
  upcoming (or, on Shabbos, today's) Shabbos. `todayHebrewDateLabel(today?)`
  — today's Hebrew date in gematriya (e.g. `"ו' תשרי תשפ״ז"`), nikud
  suppressed.

## Scripts

```
npm run build        # builds kvius-engine first, then tsc -> dist/
npm test              # vitest run (also builds kvius-engine first)
npm run test:watch
npm run typecheck
npm run build-catalog -- --db <path> --out <dir>   # tsx bin/build.ts
npm run translation-coverage -- --db <path>        # tsx bin/translations.ts
```
