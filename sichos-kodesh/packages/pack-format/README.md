# @sichos-kodesh/pack-format

The contract for `.skpack` files and everything around them. One small,
dependency-light package (only `tweetnacl`) used by the archive
(`services/archive`), the pack builder, the download site, the yeshiva
station, the phone and the web app - so a pack built anywhere verifies
and imports everywhere. The design is in `docs/offline-plan.md`.

## A pack

A `.skpack` is a plain ZIP with *stored* (uncompressed) entries:

```
manifest.json            first entry; see PackManifest in src/manifest.ts
objects.json             optional: the objects index the pack was built against
catalog.json             optional: a CatalogRelease newer than the phone's
objects/<sha256>         one entry per object, named by the SHA-256 of its bytes
```

Nothing about it is special: a file manager opens it, Android streams it
with `ZipInputStream`, and a half-copied pack fails verification before
anything is written. A large scope is split into numbered parts, each a
valid pack on its own (`manifest.part`).

- **Object**: one media file, identified by the SHA-256 of the bytes the
  phone stores. PDFs and text are the original bytes; audio is the bytes
  of a *profile* (`src` = the upstream MP3 untouched, `opus24`, ...).
- **Entry**: one item of a collection (a farbrengen, a sicha of Likkutei
  Sichos, a letter) with its `refs` to objects, keyed by the ids the apps
  already use (`hebrewYear` + `occasionId`, JEM `workerFilename`, Drive
  `driveFileId`).
- **Signature**: Ed25519 over the canonical JSON of the manifest without
  `signature`. The apps and the station carry the public keys in
  `TRUSTED_PACK_KEYS`; unsigned or foreign-key packs are refused as packs
  (their files can still be imported as loose files, below).

## objects.json

Everything the archive holds, by hash, with what each object is (kind,
profile, upstream id, collection, item). It is the trust anchor for files
that arrive without a manifest: a zip a bochur passed on, a folder copied
by hand. A file whose hash is in the index is the right bytes, whatever it
is called. `identifyFile` / `importPlan` implement that: known by hash,
then guessed by name (`JEMSK0001A.mp3`, a Drive id in a PDF name, our own
export names), with the folder path (`5748/01`, `תשמ"ח/תשרי`) giving a
scope for guesses.

## have.json and device.json

What a phone writes after every import for the station: the hashes it
holds, its versions and profiles, and a little about the device.
`computeDelta(manifest, have)` is the set difference the station copies;
`choosePacks(index, have)` picks prebuilt packs by gain without counting
overlap twice.

## Selection sizing

`sizeSelection(entries, contentTypes, index, profile)` turns "these
catalog entries, these content types, this profile" into an exact byte
count and the pack entries to build - through `app-core`'s
`listDownloadTargets`, so what the download site quotes, what the
builder packs and what the phone would download are one function.

The library (catalog schema 2) sizes the same way with
`sizeLibrarySelection`. Its scopes are a whole collection or one group
of the browse axes the app uses: `parseLibraryScopeSpec` reads
`maamorim:year:5711`, and `resolveLibraryScope` finds that group's items
and names the pack. JEM's events are recordings only, and they are not
packable yet.

## Text packs (catalog schema 3)

One pack per work (`src/text.ts`): scope `{ kind: 'work', collection:
'works', work }`, and entries in the `works` collection.

- **A unit** is `<work>/<unit>`, with one `text` ref per edition that may
  ship. `workTextEntries` takes them from the catalog, leaving out any
  source that is link-only whatever the catalog says.
- **The work** is `<work>`, with one `search` ref: an SQLite database.
  - `rows` holds the unit and edition, and `search` is a contentless FTS4
    table (`SEARCH_INDEX_SQL`).
  - The phone runs `SEARCH_INDEX_QUERY` through Android's own SQLite. FTS4
    is always there, so the app needs no SQLite of its own.
  - It stores no copy of the text: the phone holds the texts, and makes its
    snippets from them.
- **Words** are normalised the same way on both sides
  (`normalizeSearchText`):
  - no niqqud, geresh or quotes;
  - lower case;
  - only letters and digits.

  Each Hebrew word is indexed with its prefixes off too (`withHebrewStems`:
  ו ה ב כ ל מ ש, and the pairs Hebrew stacks), so "בינוני" finds
  "והבינוני". `searchIndexQuery` turns what a person types into prefix
  terms, all required.

## Scripts

```
npm run build -w @sichos-kodesh/pack-format
npm test -w @sichos-kodesh/pack-format
npm run typecheck -w @sichos-kodesh/pack-format
```
