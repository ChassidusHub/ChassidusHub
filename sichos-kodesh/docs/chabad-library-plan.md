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
| **Sefaria** | Kehot's own Hebrew text of Tanya, Likkutei Torah, Torah Or, Derech Mitzvosecha and Shulchan Aruch HaRav, plus English translations, the Chabad siddur and a few more. | An open API and a bulk export (`Sefaria-Export` on GitHub). | Kehot's texts carry **CC-BY-NC**: free, non-commercial use with credit. This app qualifies, so these can go in packs today. |
| **HebrewBooks.org** | Thousands of scanned seforim as PDFs, among them most Kehot and Chassidic printings. | No public API. Metadata reaches libraries through WorldCat (institution code NYHBW) and an OAI-PMH gateway on request (oai@hebrewbooks.org). The site blocks automated clients with a Cloudflare challenge. | Its terms forbid redistributing the scans, and its linking rules forbid linking to PDFs directly. We may link to a book's page and to a page in its viewer, and show its thumbnail. Offline copies need its permission. |
| mafteiach.app, JEM, RebbeDrive | Already indexed (WP2b): the farbrengens, hanachos, Likkutei Sichos, maamorim, yomanim, hadranim, michtavim, JEM audio. | Done. | As now. |
| To evaluate | Chabadpedia's text wiki (it has Likkutei Sichos חלק מ), chabad.org (translations), Sichos in English. | MediaWiki API; the others by page. | Links only, until licences are checked. |

Two corrections found on the way, both fixed in PR #107:

- **Likkutei Sichos volume 40 is real.** It is חלק מ, published in 5781
  by Vaad L'hafotzas Sichos in two parts. mafteiach has the first part:
  34 sichos, not in its volume menu.
- **mafteiach's "volume 41" is not Likkutei Sichos.** It is its copy of
  Sefer HaMaamarim Melukat, which the maamorim section already has. The
  crawler no longer reads it. The library now has 2,262 sichos in 40
  volumes.

## 3. What is still missing of the Rebbe's own Torah

| Work | Source | Notes |
| --- | --- | --- |
| Igros Kodesh | chabadlibrary.org | Replaces the Igros app's data files as the source. `packages/igros-index` stays as a cross-check of letter numbers and dates. |
| Toras Menachem (Hisvaaduyos) | chabadlibrary.org | 73 volumes, one per year or half-year. Each farbrengen matches a mafteiach occasion by date, so a farbrengen screen can open its text. |
| Likkutei Sichos, text | chabadlibrary.org | Today the library links the PDFs. Text makes it searchable. Volume and page tie each sicha to the existing items. |
| Maamarim Melukatim, text | chabadlibrary.org | Joins the existing maamorim items by dibur hamaschil and date. |
| Reshimos, Hayom Yom, the Haggadah, ענינה של תורת החסידות | chabadlibrary.org | Small works, each one volume or a few. |
| Sefer HaSichos 5747-5752, Sichos Kodesh text | HebrewBooks scans, others to find | Link the scans. Text only where a source has it. |
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
   chabadlibrary.org, then HebrewBooks' Chabad shelf by author and
   publisher (Kehot, Otzar HaChassidim) as scans and links.
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
2. **HebrewBooks.** Should I draft the email asking for OAI-PMH access
   and for permission to keep offline copies? Until then it is links and
   thumbnails.
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
- Pull HebrewBooks metadata for Chabad from WorldCat (NYHBW) to size its
  Chabad shelf. Send the OAI-PMH request if decision 2 is yes.
- Map Sefaria's Chabad texts and licences.
- Output: a table of every work, its sources and its rights, filled into
  this document.

### WP9 - `packages/works`

- The model from section 5, the curated authors and works registry, and
  the per-edition rights gate. Includes mapping the seven existing
  collections, with tests that every existing item id survives.

### WP10 - `packages/chabadlibrary-index`

- A polite crawler for the tree and pages, like the mafteiach sections
  crawler: ETag cache, content hashes, missing items reported and never
  deleted.
- Text is cleaned to the same small HTML the Igros text objects use.
- Imported into the archive as text objects, and mapped to works and units.

### WP11 - `packages/sefaria-index` and `packages/hebrewbooks-index`

- Sefaria: import the Chabad texts from its export with their licences.
- HebrewBooks: metadata from OAI-PMH or WorldCat, filtered to Chabad by
  author and publisher, as links, thumbnails and page-viewer deep links.
  It mirrors no PDFs unless permission comes.

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

- **chabadlibrary.org availability.** Its page API failed during
  research. If that persists, fall back to its legacy static pages, or ask
  the library for an export.
- **Size.** All text of all Rabbeim is probably a few hundred MB. The
  catalog carries only metadata. Text lives in per-work packs a person
  chooses to download.
- **Rights drift.** Each edition keeps its source and licence, and the gate
  checks every pack build. So a change of heart from one source means
  rebuilding packs, not a code change.
- **Matching the same work across sources** takes curation. The registry
  in WP9 is hand-kept on purpose.
