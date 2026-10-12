# RFC 0004: Which kind each sefer is, and what each view reads

- Status: proposed
- Issue: #250
- Author (lane or person): Views team, with the Catalog team
- Date: 2026-10-12

## Problem

The new site's reader (apps/www/app/reader) draws every page the same way:
a title, the words, their footnotes. That is right for a sicha. It is wrong
for most of the rest of the library, and the five-teams plan
(studio/plans/five-teams.md, approved 2026-10-12) asks for a view per kind
of text, in this order: letters, hisvaaduyos, indexes, Hayom Yom (a book,
no daily learning), Tanya and Shulchan Aruch HaRav, Chumash with Rashi,
Tehillim and Rambam, diaries, Siddur.

Two things are missing before any of those views can be built:

1. **Nothing says which kind a sefer is.** A sefer has a `genre` and its
   `levels`, but neither picks a layout. Hayom Yom's genre is `minhagim`;
   Toras Menachem's is `sichos`, the same as Likkutei Sichos, though one is
   a farbrengen per unit and the other a sicha (checked on the live catalog:
   `/hayom-yom` has levels `["day"]`, `/toras-menachem` has
   `["volume", "farbrengen"]`, `/tanya` has `["part", "chapter", "volume"]`).
2. **Nothing says what each unit is.** This is the Catalog team's main
   problem: many units are named only ב"ה or by a folder name, so a letter
   has no number, date or addressee, and a maamar no ד"ה. A view can only
   show the facts the catalog keeps, so Catalog and Views must agree which
   facts there are, where they live, and how they reach the page.

## Proposal

In plain words: every sefer says which **view** draws it, every unit says
what **kind** of thing it is plus a few facts its view shows under the
title, and the catalog snapshot carries both, so a page knows its layout
before its words arrive. In the reader, each view is one file.

### 1. A sefer's view (`work.view`)

A new optional field on a work, one of:

| View | For | A unit is | Shows under the title | Sefarim (first ones) |
| --- | --- | --- | --- | --- |
| `sichos` | sichos and maamarim; the default | a sicha, a maamar | date and occasion; a maamar's ד"ה | Likkutei Sichos, Sefer HaSichos, Sefer HaMaamarim |
| `letters` | letters | a letter | number, date, addressee, place | Igros Kodesh (each Rebbe's) |
| `hisvaaduyos` | farbrengens as said | one printed piece: a farbrengen's sichos (in sections א, ב, …) or its maamar, grouped by the farbrengen | the farbrengen's date and occasion, mugah or not, its sections, its recording | Toras Menachem Hisvaaduyos, Sichos Kodesh |
| `index` | indexes (maftechos) | a letter of the index, holding its entries | the sefer it indexes; whether it is one volume's or the merged one | the Likkutei Sichos indexes (#195) |
| `daybook` | a book of days, read as printed | a day | the day's date | Hayom Yom (#104, #105) |
| `chapters` | a book of chapters or simanim | a chapter, a siman | number; glosses and Kuntres Acharon apart | Tanya, Shulchan Aruch HaRav |
| `verses` | a text with numbered verses or halachos and a commentary | a chapter, a perek | numbered verses, the commentary beside them | Chumash with Rashi, Tehillim, Rambam |
| `diary` | dated entries | an entry, a reshima | its date | Reshimos, Reshimas HaYoman |
| `siddur` | prayers | a prayer, a section | instructions in small type, nusach notes | Siddur |

Likkutei Sichos' Hosafos stay in `sichos` but as their own kind of unit
(`hosafa`, below): a different layout, never mixed with sichos.

Words of a page with no text yet (a scan, a PDF, withheld) are drawn the
same in every view, as today: that is the text's kind, not the sefer's.

**Who sets it:** Catalog, by suggestion, a sefer at a time, with its
research note (studio/catalog-research/<sefer>.md). It is a fact about the
book, so it is never guessed for show: while it is unset, the reader picks
a view by the unit's own level (below), and the sefer's page says nothing.

### 2. What a unit is

New optional fields on a unit, each set by Catalog through a suggestion:

| Field | What | Example |
| --- | --- | --- |
| `kind` | what the unit really is, when its position's level does not say it | `sicha`, `maamar`, `hosafa`, `letter`, `reshima`, `day`, `chapter`, `siman`, `entry`, `prayer` |
| `heading` | a maamar's ד"ה as printed, at most about four words and "גו'", with no date (the Melukat naming); a letter's opening words; a localName | `{ "he": "ד\"ה באתי לגני" }` |
| `number` | a letter's number in its sefer, a siman's | `"א'תתקמג"` |
| `to` | a letter's addressee, as printed; a localName | `{ "he": "הרה\"ח ... שי'" }` |
| `place` | where a letter was written, as printed; a localName | `{ "he": "ברוקלין" }` |
| `occasion` | the occasion, as an event names it (`EventData.occasion`) | `yud-shvat`, `shabbos-parshas-bo` |
| `parsha` | the parsha a sicha is on, apart from its occasion (Likkutei Sichos and Sefer HaSichos go by parsha) | `bo` |
| `muga` | whether the Rebbe edited it: `mugah`, `bilti-mugah` or `hanacha` | `bilti-mugah` |
| `labelOrigin` | a machine's guess at any of the above, until a person checks it (`MachineOrigin`) | `{ "by": "catalog:labeller", "checked": false }` |

Already there and read as they are: `label` (its name, which Catalog fixes
from ב"ה to a real one), `date`, `events` (a sicha to its farbrengen, which
gives its recordings), `editions` (a letter's handwritten copy is an
edition with `role: "manuscript"` and its `url`) and `position` (its place;
the last level is its kind when `kind` is unset).

**In Toras Menachem a unit is one printed piece, grouped by its
farbrengen** (Catalog's Toras Menachem worker, #241, 2026-10-12). Each unit
is one chabadlibrary page: "שיחת ש"פ …" is all of a farbrengen's sichos, in
sections א, ב, … (12 at the median), which the print does not title as
separate sichos; a maamar said there is its own unit with the same date
(589 dates are a maamar and a sicha; others two sichos or two maamarim);
telegrams, blessings, letters and רשימות are one unit each. So the
farbrengen is not a unit but what groups units: by `date` and `occasion`,
both in the labels once suggestions #3654-#3666 are approved, and by
`events` where the farbrengen's event is known. The hisvaaduyos view draws
the sections from the `ois` marks in the words, and links the maamar and
the sichos of one farbrengen to each other through that grouping.

A machine's labels show as the machine's (the "machine output is always
labelled" rule) until `labelOrigin.checked` is set. People check them on
Flow's review queue, a batch at a time.

### What each view reads, and where it comes from

The first three views' mockups (Views manager, issues #251-#258) need these.
Whatever a page lacks, it is drawn as the plain reader, never with an empty
slot.

| View | Reads | From |
| --- | --- | --- |
| letters | number, date, place, addressee | unit fields (snapshot) |
| letters | handwritten copy | an edition with `role: "manuscript"` (`/v1/view`) |
| hisvaaduyos | date, occasion, mugah or not | unit `date`, `occasion` and `muga` (snapshot); its event where known |
| hisvaaduyos | section letters (אותיות) | the `ois` page mark in the words (#152); their labels in the snapshot as `osios` for the volume's grid |
| hisvaaduyos | stage directions ("ניגנו", "אמר לחיים") | a paragraph with the `small` mark today; a segment kind `stage` in schema 18 so a view can set it apart |
| hisvaaduyos | a maamar said there, as a link | the unit of the same sefer with the same date and occasion and `kind: maamar` (snapshot) |
| hisvaaduyos | the recording, and the time each section starts | `events` to the recording; the alignment's spans at each `ois` (`/v1/view`, after the words) |
| index | entry headings, page references | the index's words: one `item` segment per entry, its pages as links (packages/core/src/mafteach.ts) |
| index | a page reference as unit and page | the sefer's contents maps (a printing's page ranges per unit), resolved when the index is read |
| index | see also | a link from an entry to another entry |
| index | one volume's or the merged index | the sefer's `addition` (`kind: "index"`, `to`) and, for the merged one, its own sefer |
| every view | "page N in the print" | the contents maps, as above, named in the snapshot as each unit's `pages` in its first printing |

### 3. In the catalog snapshot (docs/catalog-snapshot.md)

Added fields only, so `format` stays 1 (a reader ignores what it does not
know):

- `tree.json`: each work gets `view` when set.
- `work-<id>.json`: each unit gets `kind`, `date`, `heading`, `number`,
  `to`, `place`, `occasion`, `parsha`, `muga`, `osios` (its אותיות' labels),
  `pages` (`"49-54"` in its first printing) and `machine: true` (an
  unchecked guess) when set, and only then. A letter's facts are about 80
  bytes; a sicha with none adds nothing.
- `names.json`: a unit's `kind` column is its `kind` when set, else its own
  level, as now. A maamar is then found as a maamar under its ד"ה.

So a click to a unit can draw its frame, its title and the facts under it
from the snapshot at once; the words come after (the instant-pages rule).

The page's API read (`GET /v1/view`) also carries them, with the sefer's
`view`, so a page drawn on the server picks the same view and keeps its
edge tags (www-snapshot-browser-only).

### 4. In the reader (this pull request)

- `apps/www/app/reader/view.ts`: what a view is (`ReaderView`: its `kind`,
  the unit `levels` it is for, a `Head` under the title, and `Words`) and
  how a page picks one (`pickView`): the sefer's `view`, else the view for
  the unit's own level, else `sichos`. A kind named before its view is
  built falls through the same way.
- `apps/www/app/reader/views.ts`: the registry. It finds every
  `apps/www/app/views/<kind>.tsx` by its file, so a new kind is one file
  and no other line.
- `apps/www/app/views/sichos.tsx`: today's words and footnotes, moved here
  unchanged as the first view.
- The reading page around a view stays one: the path bar, the title, Edit,
  the corner menu, fixing, the footnote sheet, the sicha before and after.
  A view may not add its own colours or components (COMMON.md); it asks
  Flow for them.

Nothing a reader sees changes with this pull request.

### Shipping order

1. This RFC with the registry (no change to what anyone sees).
2. Built-in schema 18 (packages/model): `work.view`, the unit fields above,
   and the page segment kind `stage`.
   No SQL migration: the catalog takes new built-in schemas through its own
   system changeset at start (packages/core/src/catalog.ts). The MCP
   server's `suggest_items` accepts the new fields with no change, since it
   writes fields as given (#208).
3. The snapshot's new fields (with PR #229's builder) and `/v1/view`'s.
4. Catalog labels Toras Menachem Hisvaaduyos first, sending `view:
   hisvaaduyos` and each farbrengen's date and occasion in its batch.
5. Each view in the plan's order, after Shmuly sees its mockup once.

## Cost and risk

- Work: Views (registry, then a view at a time), Catalog (labels, by
  suggestion), Studio Data (schema 18, `/v1/view`, the snapshot's builder).
- Page budget: the reader's code ships with every library page (one route
  draws shelves, sefarim and sichos), and those pages sit at the 130 kB
  JavaScript budget: about 129,980 bytes with this registry, which was
  trimmed to 49 bytes for that reason. Every view after sichos must keep
  its code out of that first load: a view file stays small (its kind and
  levels) and loads its `Head` and `Words` in their own chunk, which the
  page asks for in its first bytes (a `Link` preload, as the Torah font
  is), so it still draws without a wait. How, is the first view's PR to
  settle with Flow, who owns the budgets.
- Running cost: none new. The snapshot grows by the facts Catalog adds,
  about 60 bytes for a labelled letter, nothing for an unlabelled unit.
- Live site: step 1 changes no output. Step 2 adds optional fields only; an
  older site ignores them. A wrong `view` draws a sefer in the wrong layout
  until the suggestion is undone, and the text is never lost.
- Undo: every field is set by an ordinary suggestion and undone the same
  way. The registry is code and reverts cleanly.
- Asks of Shmuly: approving Catalog's batches (as planned) and each view's
  mockup once. No paid runs, outside services, DNS or pipelines.

## Alternatives

- **Pick the view from `genre`.** Genre is the reader app's shelf, not a
  layout: Hayom Yom is `minhagim`, Toras Menachem `sichos`. Kept as it is.
- **A level of the position for each farbrengen.** It would give the
  grouping a place in the path, but Toras Menachem's volumes are printed
  piece by piece, and date and occasion already group them without moving
  every unit's path.
- **Pick the view from `levels` alone.** Close (`day`, `farbrengen`,
  `letter`), and it is the fallback here, but levels are named by
  importers (`volume`, `part`, `chapter` mean different things in different
  sefarim), and a person cannot correct a layout by renaming a level
  without moving every unit's path.
- **A view per sefer, by id, in code.** Every new sefer would need a pull
  request, and the catalog is community-edited: the layout belongs with the
  book's other facts, where anyone can suggest it.
- **Put the facts in the words (a heading segment).** Then they arrive only
  with the words, after the frame, and the snapshot's names cannot find a
  maamar by its ד"ה or a letter by its number.
- **Do nothing.** Every kind keeps the sicha's layout and the ב"ה names.
