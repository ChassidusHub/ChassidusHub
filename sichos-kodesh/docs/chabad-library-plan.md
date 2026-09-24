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

### WP12 - catalog schema 3, API `/v3`, text packs

- `works` in the catalog, served under `/v3/`, and the phone plumbing, as
  WP2b part B did for schema 2.
- Text packs per work, with a full-text search index (SQLite FTS5) inside
  each pack so search works offline.

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
