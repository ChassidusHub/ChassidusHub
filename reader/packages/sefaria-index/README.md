# @chassidushub-reader/sefaria-index

Sefaria's Chabad texts as **units and editions** of the works in
`packages/works` (`docs/chabad-library-plan.md`, WP11). Each edition keeps
its licence, and only the ones the rights gate lets ship keep their text.

```
npm run sefaria-index -w @chassidushub-reader/sefaria-index -- list
npm run sefaria-index -w @chassidushub-reader/sefaria-index -- import                 # every work
npm run sefaria-index -w @chassidushub-reader/sefaria-index -- import --work tanya    # one work
```

`import` options:
- `--out <dir>`: where the result goes (default `data/`);
- `--cache <dir>`: where Sefaria's answers are kept (default `.cache/`);
- `--delay-ms <n>`: the pause between requests (default 500);
- `--refresh`: ask Sefaria again even for answers already in the cache.

Both folders are gitignored. The import is reproducible from this code, like
the mafteiach and JEM indexes.

## What it reads

The registry (`packages/works`) says which Sefaria titles and versions
belong to which work, and each version's licence and credit. For each
title, the importer:

1. Reads the index with its schema, titles and content counts
   (`api/v2/index/<title>?with_content_counts=1`).
2. Walks the schema to its leaves. A leaf's ref is the title and the
   English titles of the nodes above it (`Tanya, Part I; Likkutei Amarim`).
   A `default` node takes its parent's ref. A node named only by a shared
   term takes that term (Torah Ohr's `Noach`).
3. Fetches each leaf once per version (`api/v3/texts/<ref>?version=hebrew|<title>`).
   A leaf Sefaria won't serve whole is fetched section by section.

The client is polite:
- one request at a time, half a second apart;
- it names itself in the User-Agent;
- it retries a 429 or 5xx with back-off;
- it caches every answer, so a second import sends no requests.

## What it makes

- **Units:**
  - A unit is a section of a leaf: a chapter of Tanya, a siman of the
    Shulchan Aruch, a maamar of Torah Ohr. A leaf with one level (a title
    page, a prayer) is one unit.
  - A unit exists when any version has text for it.
  - Its id is its path in the work: `part1/32`, `orach-chayim/second-edition/5`.
  - Its labels come from Sefaria's Hebrew and English titles and section
    names: `חלק ראשון; ליקוטי אמרים, פרק ל״ב`.
- **Companion texts** attach to the same work under a short name. Sources
  and References on Torah Ohr becomes `sources-and-references/...`, and
  the Kuntres Acharon on the Shulchan Aruch HaRav becomes `kuntres-acharon/...`.
- **Editions:** one per version that has the unit, with its Sefaria ref,
  language, version, licence and credit. `editionUrl` (in
  `packages/works`) links each one to its page on Sefaria.
- **The contents**: the work's parts in Sefaria's order down to its units,
  so a reader can show the table of contents.
- **Text objects**, for the editions that may ship:
  - one small HTML fragment per unit and edition, the same bytes on every
    run;
  - Sefaria's markup becomes a fixed set of tags:
    - paragraphs, bold and italic;
    - Kehot's page and daily-study markers become `<span class="mark">`;
    - footnotes move to an `<aside class="notes">`, linked both ways;
  - each carries its credit, licence and a link to Sefaria in a
    `<footer class="source">`;
  - the edition records the text's sha256 and size.

The output, one folder per work:

```
data/<work>/work.json                          units, editions, contents
data/<work>/text/<unit id>@<edition>.html      each kept text
```

`readWorkImport(out, workId)` reads it back for whatever stores or packs
the texts (the text packs of WP12).

## Rights

The gate is the one in `packages/works` (`mayShip`), per edition:
- Kehot's CC-BY-NC texts ship with their credit.
- The community translations (CC0) and Ma'aneh Lashon (public domain) ship.
- Editions whose licence is unknown keep no text. They stay links to
  Sefaria: the Siddur's Hebrew, Neirot's Hebrew Shaar HaYichud, and both
  versions of Kuntres HaHitpa'alus.

If Sefaria reports a licence other than the one the registry records, the
edition is treated as unknown for that run and the import warns. A licence
change is a decision to take in the registry, not one to pick up silently.

```
npm test -w @chassidushub-reader/sefaria-index        # against a made-up Sefaria
npm run typecheck -w @chassidushub-reader/sefaria-index
```
