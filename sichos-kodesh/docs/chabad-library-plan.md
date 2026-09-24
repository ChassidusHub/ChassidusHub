# The Chabad library: every sefer, not only the Rebbe's

Written 2026-09-24. This extends `docs/offline-plan.md`. That plan put all
the Rebbe's Torah on the phone. This one widens the library to all of
Chabad: the Baal Shem Tov and the Maggid, every Rebbe, the Chassidim's
seforim and Chabad history. It also closes the gaps in the Rebbe's own
works that are still missing. The phone-only rule stays: the web app keeps
the farbrengens and does not get the library.

## 1. The idea in one paragraph

Today the library is seven collections shaped around mafteiach.app and
JEM. They are Likkutei Sichos, maamorim, yomanim, hadranim, michtavim,
reshimos and JEM events. The new library is organised as **works**: a
sefer or a series, by an author, split into volumes and units such as a
letter, a maamar, a sicha or a chapter. Each unit can have several
**editions** from different sources: text from chabadlibrary.org or
Sefaria, a scan on HebrewBooks, a PDF on Drive, a JEM recording. The
existing seven collections become works in that model. Nothing already
built is thrown away.

## 2. Sources, and what research found (2026-09-24)

| Source | What it has | How we can read it | What we may do with it |
| --- | --- | --- | --- |
| **chabadlibrary.org** (ספריית ליובאוויטש) | Text of the seforim of every Rebbe, the Baal Shem Tov and the Maggid, 12 works of Chassidim (אוצר החסידים) and 17 of history (מסביב לחסידות). The Rebbe's include Igros Kodesh (28 volumes), Toras Menachem (73 volumes), Likkutei Sichos, Maamarim Melukatim, Reshimos, Hayom Yom and the Haggadah. | A JSON API behind its app: `books/api/main?path=/<id>` for the tree and pages, `api/search` and `api/statistics` for search. The full tree loads (11 top groups, 73 works). Page and search calls returned server errors throughout research, so page access is the first thing to confirm. | Free to read. Links and online reading are fine. Offline copies in packs are a decision (section 6). |
| **Sefaria** | Kehot's own Hebrew text of Tanya, Likkutei Torah, Torah Or, Derech Mitzvosecha and Shulchan Aruch HaRav, plus English translations, the Chabad siddur and a few more: 12 works in all (WP8 results). | An open API and a bulk export (`Sefaria-Export` on GitHub). | Kehot's texts carry **CC-BY-NC**: free, non-commercial use with credit. This app qualifies, so these can go in packs today. |
| **HebrewBooks.org** | 60,419 scanned seforim as PDFs. The Chabad shelf is about 1,450 books and 440,000 pages (section 2a). | The site has no public API and blocks automated clients with a Cloudflare challenge. The metadata is open another way: אוצריא (Otzaria) publishes the whole HebrewBooks catalog as a SQLite file (section 2a). WorldCat (NYHBW) and an OAI-PMH gateway on request (oai@hebrewbooks.org) are the official routes. | Its terms forbid redistributing the scans, and its linking rules forbid linking to PDFs directly. We may link to a book's page (`hebrewbooks.org/<id>`) and to a page in its viewer, and show its thumbnail. Offline copies need its permission. |
| mafteiach.app, JEM, RebbeDrive | Already indexed (WP2b): the farbrengens, hanachos, Likkutei Sichos, maamorim, yomanim, hadranim, michtavim, JEM audio. | Done. | As now. |
| To evaluate | Chabadpedia's text wiki (it has the text of "חלק מ"), chabad.org (translations), Sichos in English. | MediaWiki API; the others by page. | Links only, until licences are checked. |

Two corrections found on the way, both fixed in PR #107:

- **"חלק מ" is not a volume of Likkutei Sichos.** The set is 39 volumes.
  "חלק מ" is two books of supplements (מילואים) that Vaad L'hafotzas
  Sichos printed for Yud Shevat 5781, 20 years after volume 39. It holds
  sichos and hadranim the Rebbe edited that were never gathered into a
  volume, starting with ענינה של תורת החסידות. Kehot, which publishes the
  39, disputes the Vaad's right to print Likkutei Sichos. mafteiach keeps
  it out of its volume menu: its `by_volume/40` page is reached only from
  14 parsha and moad pages, where the group is headed "חלק" with no
  number, and it has the first book only (34 sichos, ח"מ [א]). HebrewBooks
  also has the 39 volumes and no 40th. The library now keeps the 39
  volumes (2,228 sichos) and puts the 34 in a separate group,
  `supplement`, named מילואים - "חלק מ", with each item flagged
  `supplement: true`.
- **mafteiach's "volume 41" is not Likkutei Sichos.** It is its copy of
  Sefer HaMaamarim Melukat, which the maamorim section already has. The
  crawler no longer reads it.

### 2a. How אוצריא reaches HebrewBooks

Otzaria, the open-source seforim app, shows every HebrewBooks book in its
library and can download the PDF. Its code (`github.com/Otzaria/otzaria`)
shows two separate pieces:

- **The catalog is public.** Otzaria downloads
  `otzar-HB_catalog.db.zst` from the latest release of
  `github.com/Otzaria/otzar-HB_catalog` (6 MB compressed, 37 MB SQLite,
  catalog version 9 today). Its `hebrew_books` table has one row per
  HebrewBooks book: `id_book` (the HebrewBooks id), `title`, `author`,
  `printing_place`, `printing_year`, `pub_date`, `pages` and `tags` (a
  JSON list such as `["חבד"]`). The same file carries the Otzar HaChochma
  catalog (`otzar_hahochma`, 163,416 books) and `otzaria_hebrew_books`,
  which maps HebrewBooks ids to the books Otzaria has as text, with a
  confidence and a best match. It has no licence file. It is bibliographic
  facts, and the only link it gives is the book page,
  `hebrewbooks.org/<id>`.
- **The PDFs come from a private mirror.** Otzaria downloads
  `files.hebrewbooksoffline.dpdns.org/HebrewBooks/books/<id>.pdf`, a copy
  of the offline HebrewBooks drive (HebrewBooks' own hard-drive product,
  `Katalog.db` plus the PDFs), and sends Otzaria's own app key in a
  header. Without that key the server answers 403. That key is Otzaria's.
  We don't use it, and the mirror doesn't change what HebrewBooks' terms
  allow.

What the catalog shows for Chabad (read 2026-09-24):

- About **1,450 books and 440,000 pages** carry the tag חבד or חב"ד, or
  have a Rebbe, Tomchei Temimim or Lubavitch as the author. About 500
  are the Rebbe's.
- **The Rebbe's**: Likkutei Sichos 1-39 in two scan sets (no 40th), Toras
  Menachem Hisvaaduyos by year, Sichos Kodesh 5710-5741, Igros Kodesh (32
  books), Sefer HaSichos 5747-5752, Reshimos, the Haggadah, Hayom Yom,
  Sefer HaMaamarim Melukat, the שערי series and English translations.
- **The other Rabbeim**: the Alter Rebbe (about 130 books), the Tzemach
  Tzedek (87), the Frierdiker Rebbe (about 130), the Rebbe Rashab (69) and
  the Rebbe Maharash (31). The Mitteler Rebbe has one book under his name
  as written, so his works need a title search.
- **97 of those books map to text in Otzaria's own library**: Tanya, Torah
  Or, Likkutei Torah, Shulchan Aruch HaRav, the Tzemach Tzedek's responsa,
  Derech Mitzvosecha, the siddur and more. Otzaria's text library is a
  source to evaluate, with its own licences per book.

So HebrewBooks metadata no longer waits on HebrewBooks' OAI-PMH gateway.
WP11 reads Otzaria's catalog at build time, filters it to Chabad, and ties
each scan to our works (Likkutei Sichos volume N is a HebrewBooks id,
page for page). Offline PDFs still need HebrewBooks' permission. That is
decision 2.

## 3. What is still missing of the Rebbe's own Torah

| Work | Source | Notes |
| --- | --- | --- |
| Igros Kodesh | chabadlibrary.org | Replaces the Igros app's data files as the source. `packages/igros-index` stays as a cross-check of letter numbers and dates. |
| Toras Menachem (Hisvaaduyos) | chabadlibrary.org | 73 volumes, one per year or half-year. Each farbrengen matches a mafteiach occasion by date, so a farbrengen screen can open its text. |
| Likkutei Sichos, text | chabadlibrary.org | Today the library links the PDFs. Text makes it searchable. Volume and page tie each sicha to the existing items. |
| Maamarim Melukatim, text | chabadlibrary.org | Joins the existing maamorim items by dibur hamaschil and date. |
| Reshimos, Hayom Yom, the Haggadah, ענינה של תורת החסידות | chabadlibrary.org | Small works, each one volume or a few. |
| Sefer HaSichos 5747-5752, Sichos Kodesh text | HebrewBooks scans (in Otzaria's catalog), others to find | Link the scans. Text only where a source has it. |
| Chiddushim uBiurim b'Shas, Biurim l'Pirush Rashi, Heichal Menachem | HebrewBooks scans | Link-only for now. |
| JEM video | JEM (ccdb) | The archive has JEM audio only. The same events carry video. |

## 4. Beyond the Rebbe

In the order the phone would show them:

1. **The Baal Shem Tov and the Maggid**: Keser Shem Tov and Or Torah, from
   chabadlibrary.org.
2. **The Alter Rebbe**: Tanya, Torah Or, Likkutei Torah and Shulchan Aruch
   HaRav from Sefaria under CC-BY-NC. His maamarim, responsa, the siddur
   and his Igros come from chabadlibrary.org.
3. **The Mitteler Rebbe, the Tzemach Tzedek, the Rebbe Maharash, the Rebbe
   Rashab and the Frierdiker Rebbe**: every work chabadlibrary.org lists,
   such as Toras Chaim, Or HaTorah, Derech Mitzvosecha, Toras Shmuel,
   Hemshech Ayin-Beis, Sefer HaMaamarim and Sefer HaSichos, and each
   Rebbe's Igros.
4. **Chassidim and history**: אוצר החסידים and מסביב לחסידות from
   chabadlibrary.org, then HebrewBooks' Chabad shelf (the חבד tag and the
   authors in Otzaria's catalog, section 2a) as scans and links.
5. **Shiurim** by mashpiim, as audio, are a later question. Section 6
   has it.

## 5. The model: works, units, editions

A new package, `packages/works`, holds the shape every source maps into:

- **Author**: a Rebbe or a Chassid, with Hebrew and English names and
  years. This is a curated list of a few hundred.
- **Work**: a sefer or a series. It has an id such as `igros-kodesh-rebbe`
  or `tanya`, titles, authors, a genre (maamarim, sichos, igros, halacha,
  history, siddur) and its structure levels, such as volume, then letter.
- **Unit**: the piece a person reads or hears, such as a letter, a maamar,
  a sicha or a chapter. It carries its place in the work, a date when
  known, and links to farbrengens (mafteiach occasion ids) and other units.
- **Edition**: one source's copy of a work or unit. It has a kind (text,
  scan, PDF, audio, video), a source, the source's own id, and its rights.
  Text editions become text objects in the archive, as `sk-archive
  import-text` already does for the Igros.
- **Rights**: decided per edition, not per collection. The gate in
  `packages/catalog/src/rights.ts` grows from a per-collection table into
  a per-source-and-licence one, with values `ship`, `ship-with-credit`,
  `link-only` or `local-only`.

The seven existing collections map in as works: `likkutei-sichos`,
`sefer-hamaamarim-melukat` and so on. Their item ids stay, so downloads,
progress and packs already made keep working.

On the phone this is **catalog schema 3**. It adds `works` next to
`byYear` and `library`, the same way schema 2 added the library without
touching the farbrengens. The phone moves to `/v3/`, and the web stays on
schema 1.

## 6. Decisions for Shmuly

1. **Offline text from chabadlibrary.org.** It is free to read, but that
   alone doesn't license copying its text into packs we hand out. My
   recommendation: read and link online in the app now, and ask the
   Library of Agudas Chassidei Chabad for its blessing on offline packs.
   If you'd rather ship without asking, the gate flips in one line.
2. **HebrewBooks.** The metadata no longer needs HebrewBooks: Otzaria's
   public catalog has it (section 2a). Should I draft the email to
   HebrewBooks asking for permission to keep offline copies of the Chabad
   shelf? Until then it is links and thumbnails. Otzaria's mirror is not
   an option without Otzaria's and HebrewBooks' agreement.
3. **Scope.** Is it texts and seforim first, with shiurim audio later?
4. **The Igros source.** Should the Igros app's data files be dropped for
   chabadlibrary.org's text once page access works? I recommend yes. The
   reader stays as a cross-check.

## 7. Work packages

Each is one PR, in order. The existing WP3 to WP7 of the offline plan keep
their numbers.

### WP8 - source spike (no code shipped)

- Confirm chabadlibrary.org page access and its page shape (text, notes,
  navigation), and measure its size: works, units, bytes.
- Pull the HebrewBooks Chabad shelf from Otzaria's catalog (section 2a),
  and curate the author and title list (the Mitteler Rebbe, Chassidim,
  Kehot printings with no Chabad tag). Send the permission request if
  decision 2 is yes.
- Map Sefaria's Chabad texts and licences.
- Output: a table of every work, its sources and its rights, filled into
  this document.

**Results (2026-09-24, second check).**

chabadlibrary.org still serves no text:

- The tree root and the 11 top groups answer (`api/main?path=/100000000`
  lists its works).
- Every work-level path returns `500 Internal Server Error`:
  - `path=/300000000` (Keser Shem Tov);
  - `path=/3400000000` (Tanya);
  - the nested and slash-less forms.
- `api/search` and `api/statistics` fail the same way, including with the
  exact parameters the site's own bundle sends (`phrase`, `section_id`,
  `offset`).
- The old static pages (`books/admur/ig/10/2973.htm` and the like) now
  return the single-page app's 1 KB shell.

So the site's text backend is down, not just its public API. WP10 waits on
it, or on the library sending an export. That is decision 1, which now
means asking for the text as well as the blessing.

HebrewBooks: the Chabad shelf numbers in section 2a stand. This session
cannot reach GitHub repositories outside this project, so WP11 reads
Otzaria's catalog release in a session that can.

Sefaria's Chabad texts, with every edition's licence as Sefaria records
it:

| Work (Sefaria title) | Hebrew | English | For packs |
| --- | --- | --- | --- |
| Tanya | Kehot, CC-BY-NC | Kehot, CC-BY-NC; community, CC0 | ship with credit |
| Torah Ohr | Kehot, CC-BY-NC | community, CC0 | ship with credit |
| Likkutei Torah | Kehot, CC-BY-NC | community, CC0 (one AI translation, excluded) | ship with credit |
| Sources and References on Likkutei Torah / on Torah Ohr | Kehot, CC-BY-NC | - | ship with credit |
| Derekh Mitzvotekha | Kehot, CC-BY-NC | community, CC0 | ship with credit |
| Shulchan Arukh HaRav | Kehot, CC-BY-NC (plain and vocalized) | community, CC0 | ship with credit |
| Kuntres Acharon on Shulchan Arukh HaRav | Kehot, CC-BY-NC | - | ship with credit |
| Ma'aneh Lashon Chabad | Warsaw 1869, public domain | community, CC0 | ship |
| Weekday Siddur Chabad | Wikisource, licence "unknown" | community, CC0 | English ships; Hebrew link-only until checked |
| The Gate of Unity (Shaar HaYichud) | Neirot, "unknown" | Markel (Neirot), CC-BY | English ships with credit; Hebrew link-only |
| Kuntres HaHitpa'alut | Neirot, "unknown" | Neirot, "unknown" | link-only |

Every edition with no licence, or "unknown", stays link-only. So do the
single-chapter samples in other languages. The rule is per edition, as
section 5 has it. WP11 reads Sefaria through its API
(`api/texts/versions/<title>`, then the texts), which answers here.

### WP9 - `packages/works`

- The model from section 5, the curated authors and works registry, and
  the per-edition rights gate. Includes mapping the seven existing
  collections, with tests that every existing item id survives.

**Built** (`packages/works`; its README has the details):

- The registry names the Baal Shem Tov, the Maggid and the seven Rebbeim.
- It holds every work chabadlibrary.org lists (73, from a snapshot of its
  tree, which still answers), each with an id, an English title and a
  genre.
- It attaches Sefaria's 12 Chabad texts to the same works, each copy with
  its licence.
- The seven collections map in as works (`likkutei-sichos`,
  `sefer-hamaamarim-melukat` and so on), and every bundled item id
  survives as a unit id (tested).
- The gate is per edition: the stricter of the licence and a per-source
  decision. A test holds it to the catalog's per-collection table.

### WP10 - `packages/chabadlibrary-index`

- A polite crawler for the tree and pages, like the mafteiach sections
  crawler: ETag cache, content hashes, missing items reported and never
  deleted.
- Text is cleaned to the same small HTML the Igros text objects use.
- Imported into the archive as text objects, and mapped to works and units.

### WP11 - `packages/sefaria-index` and `packages/hebrewbooks-index`

- Sefaria: import the Chabad texts from its export with their licences.
- HebrewBooks: metadata from Otzaria's catalog release (checked by its
  version file, like Otzaria does), filtered to Chabad by tag and author,
  as links, thumbnails and page-viewer deep links. Credit Otzaria for the
  catalog. It mirrors no PDFs unless permission comes.

**Built: the Sefaria half** (`packages/sefaria-index`; its README has the
details). Sefaria has no bulk export that keeps each version's licence
apart, so the importer reads its API, politely and cached:

- For each work the registry gives Sefaria copies, it walks each title's
  schema to its leaves and fetches each leaf once per version.
- A unit is a chapter, a siman, a maamar or a prayer. Its id is its path in
  the work (`part1/32`), and its labels come from Sefaria's Hebrew and
  English titles.
- Each version with text for a unit is an edition, with its licence and
  credit.
- An edition that may ship keeps its text, as a small HTML object:
  - paragraphs, with Kehot's page and daily-study markers kept;
  - footnotes gathered at the end, linked both ways;
  - its credit and licence in the footer.
- Unknown-licence editions (the Siddur's Hebrew, Neirot's Hebrew Shaar
  HaYichud, Kuntres HaHitpa'alus) stay links to Sefaria, with no text.
- If Sefaria's reported licence ever differs from the registry, that
  edition drops to link-only and the import warns.

The first full run (2026-09-24):

| Work | Units | Texts kept | Links only |
| --- | --- | --- | --- |
| Tanya | 124 | 258 (2.8 MB) | - |
| Torah Or, with its Sources and References | 296 | 306 (3.7 MB) | - |
| Likkutei Torah, with its Sources and References | 615 | 618 (9.2 MB) | - |
| Shulchan Aruch HaRav, with the Kuntres Acharon | 708 | 1,245 (17.9 MB) | - |
| Shaar HaYichud (The Gate of Unity) | 55 | 55 (0.8 MB, the English) | 55 (the Hebrew) |
| Derech Mitzvosecha | 133 | 134 (2.0 MB) | - |
| Kuntres HaHispaalus | 43 | - | 86 |
| Weekday Siddur | 47 | 6 (the English that exists) | 47 (the Hebrew) |
| Ma'aneh Lashon | 5 | 7 (0.1 MB) | - |
| **Total** | **2,026** | **2,629 (36.6 MB)** | **188** |

It took 506 requests (about four minutes at half a second apart), with no
warnings. A second run reads everything from the cache and sends none.

The HebrewBooks half waits on Otzaria's catalog release, which this
session cannot fetch (section 2a). Decision 2 still gates any PDFs.

### WP12 - catalog schema 3, API `/v3`, text packs

- `works` in the catalog, served under `/v3/`, and the phone plumbing, as
  WP2b part B did for schema 2.
- Text packs per work, with a full-text search index (SQLite FTS5) inside
  each pack so search works offline.

**Built: schema 3 and `/v3`** (WP12a):

- **The format** (`packages/catalog/src/works/`):
  - every author and work, each source with its rights decided;
  - each imported work's contents and units, whose editions point at a
    source and, when the text may ship, carry its object's sha256.
- **The build**: `packages/works` builds it (`build-catalog-works`) from
  the registry and the Sefaria import. A local-only source, or text kept
  for a source that may not ship, fails the build and the release.
- **The phone** bundles it (784 KB):
  - the index is read on first use;
  - each work's units are read when the work is opened;
  - it runs on schema 3.
- **The API** serves `/v3/` next to `/v1/` and `/v2/`, so phones on 1.4.0
  keep what they have.

**Built: the text packs** (WP12b):

- **One pack per sefer**, in the `works` collection:
  - every text of it that may ship, from the archive (`sk-archive
    import-text --collection works`);
  - its search index. This is FTS4 rather than FTS5, because Android's own
    SQLite always has FTS4, so the phone needs no SQLite of its own.
- **The index is contentless.** It holds no second copy of the text, and
  the phone makes its snippets from the texts it holds. Tanya's index is
  1.4 MB for 2.8 MB of text.
- **Hebrew search:**
  - the same normalising on both sides: no niqqud, geresh or quotes;
  - each word also indexed without its prefixes, so "בינוני" finds
    "והבינוני".
- **The same texts make the same pack**, byte for byte.
- **The first build** covers all eight seforim with text that may ship:
  63 MB of packs in all, from Tanya's 4.4 MB to the Shulchan Aruch HaRav's
  27 MB. Kuntres HaHispaalus has none: both its editions are link-only.
- **The phone** places texts under `texts/` and search indexes under
  `indexes/`. A search index or a text comes only with a signed manifest,
  never as a loose file.

### WP13 - the phone: browse, read, search

- Browse from the Rabbeim, to works, to volumes, to units.
- An RTL reader for text with notes, font size and bookmarks, and progress
  the same way audio has it.
- Search online through the API and offline through downloaded packs.
- "Open the scan" opens the HebrewBooks page viewer for the same page.
- A farbrengen screen shows its Toras Menachem text and every sicha and
  maamar said there.

After WP13 the phone has a user-visible feature, so it ships as a release
under the CLAUDE.md rule: version bump, merge, tag.

**Built** (mobile 1.5.0; `apps/mobile/src/seforim/` and
`src/screens/seforim/`):

- **Browse.** Library > Seforim lists the Rebbeim in order, each with his
  works, then the works of no Rebbe. A work opens on its contents, one
  level at a time, down to its units. A work that is a library collection
  (Likkutei Sichos, the maamorim) opens that collection. A work with no
  text that may ship lists its sources as links.
- **The reader** draws a text object with React Native's own `<Text>`, with
  no web view. It shows:
  - the edition's direction;
  - page and study markers, muted;
  - footnote numbers that open their note;
  - the notes and the credit line at the end.

  It also has:
  - text size (0.8 to 1.8);
  - the next and the previous unit;
  - a bookmark on any unit;
  - a chip for each edition that may be read. Editions that are link-only
    open on their source's site.
- **Where the text comes from.** The reader uses the pack's text object
  when the phone holds it (by sha256). Otherwise it reads the unit live
  from Sefaria and renders it with the same code the import uses
  (`@sichos-kodesh/sefaria-index/reader`), so both look the same. With no
  pack and no internet, the reader says so, and tries again once the
  connection is back.
- **Continue reading.** Each work's last unit and edition, and the
  bookmarks, are kept on the phone (one AsyncStorage row). The Seforim
  page opens with them.
- **Search:**
  - names of works and of units, from the catalog, so it works offline
    for every sefer;
  - the text of every sefer whose pack is on the phone, through its FTS4
    index (`searchIndex` on the native pack module, Android's own SQLite),
    with snippets cut from the held texts.
- **About** credits Sefaria and each edition's licence.

**Not done, and why:**

- **Text packs on a release build.** A text or a search index comes only
  inside a pack signed with a key the build trusts. Release builds up to
  1.5.0 trust no key; from 1.6.0 they trust the production key
  (`aac79a9724647680`, made 2026-09-24), but no text pack is published
  yet. Debug builds trust the development key, which is how packs are
  tested. Until then a phone with internet saves a sefer itself (WP14).

- **"Open the scan"** needs HebrewBooks (WP11's other half), which is
  waiting on its permission.
- **The Toras Menachem text on a farbrengen screen** needs a source for it,
  and none may ship yet (WP10: chabadlibrary.org).
- **Text search online through the API.** There is no API for it yet.
  Search without a pack covers names only.

### WP14 - saving a sefer on the phone

Packs serve places with no internet, and they wait on a place to
publish them. A phone that has internet can
save a sefer itself, the way a farbrengen downloads straight from its
source.

**Built** (mobile 1.5.0, with WP13; `apps/mobile/src/seforim/savedStore.ts`
and `saveSefer.ts`):

- **Saving.** A sefer's page has "Save on this phone", with the size the
  catalog gives. It saves every unit in every edition that may be read
  (the same rights gate as the reader). Each unit is fetched from Sefaria,
  three at a time, rendered by the same code as online reading, and
  stored under `texts/saved/<work>/`.
  - A unit already saved is not fetched again, so a stopped saving
    continues where it stopped.
  - It can be stopped, and it stops by itself when the connection goes.
  - "Remove from this phone" deletes the texts, the index and the record.
- **Its search index is built on the phone**, in the packs' own layout:
  pack-format's `SEARCH_INDEX_SQL`, `normalizeSearchText` and
  `textObjectWords`. JS writes the rows as JSON lines, and the native
  `buildSearchIndex` fills the FTS4 table with Android's own SQLite, then
  moves it into place whole. Search queries it like a pack's index.
- **The reader's order:** a pack's text object (vouched for by the
  catalog's sha256), then the saved copy, then Sefaria online.
- **Not verified by hash.** A saved copy is what Sefaria served, the same
  as reading online. When Sefaria has edited a text since the catalog was
  built, the copy differs from the pack's, and the pack's copy still wins.

### WP15 - the reader, shared, with its settings

Shmuly asked for a premium reader, with SBL Hebrew, Noto or the system
font, and with good options. The web app gets the full library and the
same reader (WP16), so the reader's core moved out of the phone.

**Built** (mobile 1.6.0):

- **Shared core in `packages/app-core/src/seforim/`.** The text object
  parser and `stripNiqqud`, the seforim model (now with `unitPosition` and
  `citation`), name search, reading from Sefaria (`fetchFromSefaria`), and
  the reader's settings and reading state. The two apps keep only their
  storage and their screens. `normalizeSearchText` moved into app-core
  too; pack-format re-exports it, because pack-format already depends on
  app-core and the other way round would be a cycle.
- **Fonts, shipped unchanged in the APK** (`android/app/src/main/assets/
  fonts`, licences in `fonts/licences/`):
  - Frank Ruehl CLM (the default) and David CLM: Culmus 0.140, GPL-2
    with the font exception.
  - SBL Hebrew 1.56a: its EULA allows free, non-commercial,
    unmodified redistribution.
  - Noto Serif Hebrew: OFL 1.1.
  - The device's own font.
  About lists each font with its licence and a link to where it is
  published.
- **Settings** (`ReaderSettings`, the Aa button), all stored in the
  reading state's row, which older rows read into (`fontScale` becomes
  `scale`):
  - size, 80% to 200%;
  - line spacing and margins, three steps each;
  - page: like the app, paper, sepia or night;
  - vowels and cantillation on or off;
  - justified or not;
  - notes at the end, or in the text;
  - page markers on or off;
  - continuous reading;
  - keeping the screen on (a window flag, through
    `SystemBarsModule.setKeepScreenOn`).
- **The page.**
  - The bar slides away while reading down and comes back on the way up.
  - A thin line shows how far into the chapter the reader is.
  - Each chapter opens with its place in the sefer ("Chapter 3 of 53").
  - In continuous reading the next chapter loads onto the same page when
    the end comes near. The place, and the bookmark button, follow the
    chapter being read.
- **The place is kept to the paragraph**: the offset into the unit (0 to
  1) is saved when a scroll comes to rest, and the chapter reopens there.
- **Sharing**: a long press on a paragraph shares its words with the
  sefer, the chapter and a Sefaria link.

### WP16 - the web app: the whole library and the seforim

Shmuly: "All full library opens also in webapp. Just offline packed
aren't." The web app (1.4.0) now has everything the phone browses. What
stays on the phone is what needs its own storage: packs, saving a sefer,
and searching the words of saved seforim.

**Built:**

- **Catalog schema 3 on the web**, like the phone: the store reads the
  farbrengens, the library and the works. The library and works stay out
  of the start-up bundle: `bundledParts.ts` loads the phone's own JSON
  files with `import.meta.glob`, so each one is a chunk of its own
  (`assets/catalog-parts/`), fetched the first time a screen asks for it.
  Until then the store returns null (`BundledWorks.index` and
  `bundledLibrary` may now return null), and `refresh()` re-renders the
  readers once a part is in. The chunks and the reader fonts are not
  precached (the precache stays at about 12 MB); the service worker
  caches each one on first use (`catalog-parts-v1`). A catalog update
  from `/v3` replaces all of it, as on the phone.
- **Shared with the phone in app-core**: `libraryModel` and
  `librarySearch` (moved from mobile, with new `itemFacts`,
  `itemPdfLabel` and `itemPlaylistEntry`) and `formatHebrewDate`, now
  safe for a date without a day (just the month) or without a year.
- **The library** (`/library/*`): the collections and their axes
  (volume, parsha, moed, year, masechta), farbrengens by moed and special
  day or by parsha, and each item's page. An item's recordings play in
  the site's own player and its PDFs open in the site's own viewer: the
  same screens, reached through `useLibraryItem`.
- **The seforim** (`/seforim/*`): the Rebbeim and their works, a work's
  contents, name search over every work and chapter, and the reader.
  Texts are read from Sefaria (it allows CORS); the service worker keeps
  each chapter read (`sefaria-texts-v1`, network first), so a chapter
  read once opens again offline.
- **The reader**, with the same settings as the phone's, stored in the
  same shape (localStorage, `sichos-kodesh:seforim-reading`):
  - the same fonts, served from `public/fonts/reader/` with their
    licences;
  - size, spacing, margins and page, as CSS variables on the page;
  - continuous reading, the place kept to the paragraph, bookmarks;
  - a Wake Lock while a sefer is open (where the browser has one);
  - the arrow keys turn the chapter;
  - selecting text brings up Copy and Share, with the sefer, the chapter
    and a link.
- **Search** gains "Search in": the farbrengens (as before) or one of the
  library's collections.
- **About** credits Sefaria and each reader font with its licence.

**Checked:** tsc, app-core, web and mobile tests; a production build; in
Chromium at phone and desktop sizes, in Hebrew and English, light, dark
and sepia, with Sefaria answered by a fixture: the library down to an
item, the seforim, the reader and its settings, continuous reading (four
chapters on one page) and the saved place. The check found the settings
panel squeezing its font row to nothing; its children no longer shrink.

## 8. Risks

- **chabadlibrary.org availability.** Its page API failed during research,
  and again at WP8 (see the WP8 results). Its legacy static pages are gone
  too. So the path is to ask the library for an export.
- **Size.** All text of all Rabbeim is probably a few hundred MB. The
  catalog carries only metadata. Text lives in per-work packs a person
  chooses to download.
- **Rights drift.** Each edition keeps its source and licence, and the gate
  checks every pack build. So a change of heart from one source means
  rebuilding packs, not a code change.
- **Matching the same work across sources** takes curation. The registry
  in WP9 is hand-kept on purpose.
- **Otzaria's catalog** has no licence file and could change shape or
  stop. The HebrewBooks importer reads it at build time and keeps what it
  took, so a missing release leaves the last good copy in place. WorldCat
  and OAI-PMH stay the fallback.
