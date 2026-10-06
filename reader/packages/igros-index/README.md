# @chassidushub-reader/igros-index

Reads the letters of Igros Kodesh (28 volumes) and the Maanos (5742-5752)
from the data files of an existing Igros app into plain JSON, one file per
volume and per year, so the library (`packages/catalog`) and the archive
(`services/archive`) can carry them as text.

## Rights: the Igros ship, the Maanos stay local

The text comes from a commercial app's data files. It is read and built
locally; `data/` is git-ignored, and the test fixtures are synthetic.
Shmuly cleared the Igros Kodesh on 2026-09-24: they ship as a readable
sefer (below, "The Igros as a sefer"). The Maanos stay local until they
are cleared too. `packages/catalog/src/rights.ts` holds the gate
(`SHIPPABLE_COLLECTIONS`), and packages/works, the release and the pack
builders all read it.

## Building

The source app's asset folder has `data.sqlite` (the letters),
`miniletters.zip` (the maanos) and `tags.json`. Unzip the maanos once, then
build:

```
unzip <assets>/miniletters.zip -d <assets>/mini
npm run build-igros -w @chassidushub-reader/igros-index -- --data <assets> [--out <dir>]
```

It writes, under `--out` (default `packages/igros-index/data/`):

| File | What |
| --- | --- |
| `igros/vol-NN.json` | `{volume, letters}`, in printed order |
| `maanos/YYYY.json` | `{year, maanos}` |
| `tags.json` | the source's 642 topic names (it links none of them to a letter, so they can only be search suggestions) |
| `index.json` | counts per volume and year, and every source warning |

From the source as extracted on 2026-09-23: 11,059 letters in 28 volumes,
3,761 maanos in 11 years, 642 tags, and 7 warnings (below).

## What a record holds

`IgrosLetter` (`src/types.ts`): `id` (`igros:3275`; a supplement printed
`קמא*` is `igros:141a`), the number and the numeral as printed, the volume,
the page in the printed volume when the source has it, the date line and
city as plain text, the year the date line names (`yearFromDateLine`:
9,854 of the letters name one; 1,062 have no date line), and the addressee, body, signature and the volume's
notes as cleaned HTML (paragraphs, bold/italic/underline, line breaks;
no attributes, no empty paragraphs). `summary` is the source's one-line
summary, plain text. `sourceKey` is the source's own row key.

`Maaneh`: `id` (`maanos:5742:4`), year, number, the numeral as printed, the
date line, and the body as cleaned HTML.

## Where it goes

- **The seforim.** `import-igros` makes the Igros a readable sefer (below).
- **The library.** `build-catalog --igros <this output>` makes the `igros`
  and `maanos` collections, grouped by volume and year, for local use. They
  go to their own folder and never into an app (`packages/catalog`, "Gated
  collections"); the Igros reach the apps as a sefer instead.
- **The archive.** `sk-archive import-text --collection igros --dir <this
  output>` stores each letter as a text object (`src/textObjects.ts`). A
  text object is one small HTML document per letter or maaneh, the same
  bytes on every build.

`readIgrosOutput(dir)` reads this output back for both.

## The Igros as a sefer

```
npm run import-igros -w @chassidushub-reader/igros-index            # after build-igros
npm run build-catalog-works -w @chassidushub-reader/works -- \
  --imports $PWD/packages/sefaria-index/data --imports $PWD/packages/igros-index/import
```

`import-igros` (`src/importWork.ts`) turns the build output into:

- `import/igros-kodesh-rebbe/work.json` (git-ignored): the work as
  packages/works takes an importer's output. Its contents are the 28
  volumes (`חלק א`...), each a list of letters; each letter is a unit (id
  `3275`, `141a`; label `אגרת ג'ערה`, `Letter 3275`) with one Hebrew
  edition naming its text object's sha256 and size.
- `services/catalog-api/texts/igros-kodesh-rebbe/vol-NN.json` (git-ignored:
  this repository, inside ChassidusHub, keeps no texts): each volume's text
  objects. They go to the archive (`sk-archive ... --collection igros`);
  ChassidusHub serves them, and the apps read a letter at
  `https://api.chassidushub.org/v1/app/v3/texts/<sha256>` and check its size.

A text object (`src/textObjects.ts`) is in the reader's own form: the date
line and city as lines set to the end side, the addressee, body and
signature (also to the end side), the volume's notes in an
`<aside class="notes">` (the reader lists them after the letter,
unnumbered, since nothing in the letter points to them), and a footer
saying where it is printed: `אגרות קודש חלק א, אגרת ו, עמ׳ טו`.

## Letter numbers

A letter's number is read from its printed numeral, not from the source's
`idx` column. The letters are summed, so the deliberately reordered
numerals (`תשדמ` for 744) read right, and a letter followed by a geresh
counts thousands (`ג'ערה` is 3275). `idx` has seven data-entry slips, each
of which would give two letters one id; the numeral gives them all distinct
ids, and each disagreement is reported as a `number-mismatch` warning:

| Printed | Number | `idx` |
| --- | --- | --- |
| א'שת | 1700 | 700 |
| ד'ערה | 4275 | 3275 |
| ה'תערב | 5672 | 4672 |
| ו'רפ | 6280 | (blank) |
| ו'תדש | 6704 | 6304 |
| ו'תשדמ | 6744 | 6344 |
| י'עדרת | 10674 | 674 |

Should a numeral ever be missing, the reader falls back to `idx`. Should
two letters still share an id, the second gets a `-2` suffix. Either case is
reported as a warning.

## Developing

```
npm test -w @chassidushub-reader/igros-index
npm run typecheck -w @chassidushub-reader/igros-index
```
