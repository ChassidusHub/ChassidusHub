# @sichos-kodesh/works

The library as **works** (`docs/chabad-library-plan.md`, WP9). A work is a
sefer or a series by an author. It is split into **units**, the pieces a
person reads or hears (a letter, a maamar, a sicha, a chapter), and each
has **editions**: one source's copy.

- **Types** (`src/types.ts`): `Author`, `Work`, `WorkSource`, `Unit`,
  `Edition`, `Licence`, `RightsDecision`, plus what an importer produces:
  - `ImportedWork`: a work's units and its contents;
  - `ContentsNode`: the table of contents, in the work's own order;
  - `TextObjectRef`: the sha256 and size of an edition's kept text.
- **The registry** (`src/registry/`), kept by hand on purpose:
  - the authors: the Baal Shem Tov, the Maggid and the seven Rebbeim;
  - every work chabadlibrary.org lists, 73 under 11 groups, from a
    snapshot of its tree (`chabadlibraryTree.ts`, titles and ids only),
    each with an id, an English title and a genre;
  - Sefaria's 12 Chabad texts (the WP8 results), attached to the same
    works with each copy's licence and credit;
  - the phone's collections (yomanim, hadranim, michtavim, JEM recordings,
    and the gated maanos) as works of their own.
- **The seven collections as units** (`src/collections.ts`):
  `collectionUnits(library, collection)` keeps every item's id, so
  downloads, progress and packs made so far stay attached. The item's
  files become editions: mafteiach's PDF links and JEM's recordings.
- **The rights gate, per edition** (`src/rights.ts`):
  - `rightsFor(copy)` is the stricter of what the copy's licence allows
    and any decision taken for its source (`SOURCE_DECISIONS`);
  - `mayShip(copy)` is true for `ship` and `ship-with-credit`.

  | Licence | Decision |
  | --- | --- |
  | CC0, public domain, facts and links | ship |
  | CC-BY, CC-BY-NC | ship with credit |
  | unknown, free to read, site terms | link-only |
  | commercial | local-only |

  The source decisions are the plan's open ones:
  - chabadlibrary.org: link-only (decision 1);
  - HebrewBooks: link-only (decision 2);
  - the Igros app: local-only.

  Flipping one is that decision and nothing else. A test holds the gate to
  the catalog's per-collection table (`packages/catalog/src/rights.ts`).

- **Links** (`src/links.ts`): `editionUrl(edition)` is where a person reads
  an edition at its source (a Sefaria page, a HebrewBooks book).

The Sefaria importer (`packages/sefaria-index`, WP11) fills in units and
editions for the works with Sefaria copies. Catalog schema 3 (WP12) builds
`works` from both.

```
npm test -w @sichos-kodesh/works        # against the library the phone bundles
npm run typecheck -w @sichos-kodesh/works
```
