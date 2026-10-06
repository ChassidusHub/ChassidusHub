# ChassidusHub and Sichos-Kodesh

Sichos-Kodesh (the Sichos Kodesh apps, a separate repository) is
ChassidusHub's first consumer and its origin. ChassidusHub keeps no copy of its
content; the two meet at the contracts below.

## 1. The works model

`@chassidushub/model` exports Sichos-Kodesh's works contract
(`packages/works/src/types.ts` there) unchanged, in
`packages/model/src/works.ts`: `Names`, `Author`, `Genre`, `SourceId`,
`Licence`, `EditionKind`, `WorkSource`, `Work`, `TextObjectRef`,
`Edition`, `Unit`, `RightsDecision`, `ContentsNode`, `ContentsEntry`,
`ImportedWork`. The one difference: `Work.collection` is a plain string,
since the phone's collection ids belong to Sichos-Kodesh's catalog.

Sichos-Kodesh can import these from `@chassidushub/model` in place of its own.
They change only together with Sichos-Kodesh. ChassidusHub's own item types
(`entities.ts`) grow from them and widen them - more sources, more
languages, English names optional - without changing them.

Shared behaviour kept to the same contract:

- date keys (`5742-05-10`, Tishrei-first, `06A`/`06B`) =
  `toMafteiachHebrewDateKey` in its `packages/catalog`;
- `normalizeSearchText` = its `packages/app-core/src/search`;
- canonical JSON and Ed25519 manifest signatures = its `packages/pack-format`;
- rights: ChassidusHub's four states map one to one onto its `RightsDecision`s.

## 2. ChassidusHub reads Sichos-Kodesh (importers)

`chassidushub import sichos-kodesh-works --from <checkout>` reads the works
Sichos-Kodesh builds (`apps/mobile/src/catalog/data/works`, catalog schema
3) and suggests them as ChassidusHub items, keeping the phone's ids in
`externalIds` (`sichos-kodesh-work`, `sichos-kodesh-unit`,
`sichos-kodesh-author`, `sichos-kodesh-collection`). The other Sichos-Kodesh
indexers are importers the same way: its HebrewBooks shelf, JEM's catalog
(jem-index), the Igros letters' dates (build-igros), and its archive's
history and lost files (services/archive) ([importers](importers.md)).
Each reads the checkout or what its indexer wrote, and never changes it.

## 3. Sichos-Kodesh builds from ChassidusHub (releases)

Every catalog edition's dumps include `sichos-kodesh-<tag>.json`:

```ts
interface SichosKodeshRelease {
  format: 'chassidushub-sichos-kodesh-works';
  formatVersion: 1;
  tag: string;          // the catalog edition, e.g. "2026.40"
  commit: number;
  authors: Author[];    // its ids (slugs) restored
  works: Work[];
  imported: ImportedWork[]; // contents and units, with the phone's unit ids
}
```

These are exactly the inputs of its `buildCatalogWorks`, so
`packages/catalog/bin/build.ts` there can take a ChassidusHub release in place
of its hand-kept registry and importer output. The release's
`manifest.json` is signed like its packs, so it verifies with
`pack-format`'s `verifyManifest` against ChassidusHub's published key.

When that switch is made, Sichos-Kodesh stops curating its own catalog,
and fixes flow the other way: through ChassidusHub suggestions.

## 4. Scans and their reading copies

The Sichos Kodesh hanachos Sichos-Kodesh's archive holds are ChassidusHub
files, each with a reading copy ([operations](operations.md)). The
published manifest (`/manifests/reading-copies/sichos-kodesh.json`) keys
them by the catalog's `driveFileId`, so Sichos-Kodesh's apps can open a
PDF's reading copy from `https://api.chassidushub.org/objects/<sha256>` and
keep the original one tap away.

## 5. What Sichos-Kodesh still needs from a release

A release carries works only (section 3). The apps' own
`packages/catalog/bin/build.ts` builds two more things, from
`mafteiach.db` and `jem.db`, that a release does not carry yet:

- **the farbrengens by year** (`<year>.json`, catalog schema 1): events
  with their occasion ids, the parts of each, and the PDFs and
  recordings of each part. ChassidusHub has these as events, recordings and
  scans once the `mafteiach` and `jem` importers are written;
- **the library** (catalog schema 2): the collections the phone browses,
  their units and their PDF editions, and the JEM collection.

For the apps to build wholly from ChassidusHub, a release would add, beside
`works`:

- `events` keyed by the phone's event ids, with dates as date keys;
- for each event and unit, its files: `sha256`, rights state, address
  (`/objects/<sha256>` when served, the source's link when not), page
  count and, when made, the reading copy's `sha256`;
- recordings with their JEM links and parts' times;
- for teshuros, the credit line; a file a family asked to stop showing
  is `preserved` and so never carries an address.

Page images and IIIF manifests (`/manifests/iiif/<scan>.json`) are for
the web and need nothing from the apps. Until those are in a release,
Sichos-Kodesh keeps building its farbrengens and library as it does now.

## 6. The apps' catalog address

The apps fetch their catalog from one address, app-core's
`CATALOG_API_BASE_URL`: since the reader app's 3.0.0 (it lives in
`reader/`, docs/plans/reader-app.md), `https://api.chassidushub.org/v1/app`.
ChassidusHub answers the app's paths there, in the same shapes (its
`packages/catalog/src/release.ts`), built from the catalog on main
(`services/api/src/appCatalog.ts`):

| The app asks (after the base) | ChassidusHub answers | What it is |
| --- | --- | --- |
| `/v1/catalog/manifest.json` | `/v1/app/v1/catalog/manifest.json` | schema 1 (the web app): the farbrengens |
| `/v2/catalog/manifest.json` | `/v1/app/v2/catalog/manifest.json` | schema 2 (phones to 1.4.0): with the library |
| `/v3/catalog/manifest.json` | `/v1/app/v3/catalog/manifest.json` | schema 3 (the phone): with the works |
| `/v<n>/catalog/<version>/catalog.json` | `/v1/app/v<n>/catalog/<version>/catalog.json` | the release the manifest names (its `url`), byte for byte its `sha256` |
| `/v<n>/catalog/changelog.json`, `/v<n>/catalog/latest/catalog.json` | the same under `/v1/app` | |
| `/v3/texts/<sha256>` | `/v1/app/v3/texts/<sha256>` | a sefer's text, as `/v1/texts/<sha256>` |
| `/v1/app/android/latest.json`, `/v1/app/android/download/<abi>` | `/v1/app/v1/app/android/...` | the phone's own updates: sent on (307) to the packs Worker, `packs.chassidushub.org` |

While a release here lacks a part its app shows (the library, today), the
catalog paths are passed on to the reader's own catalog Worker
(`reader/services/catalog-api`, the `READER_CATALOG` service binding),
with the addresses in its answers moved back under `/v1/app`. Phones so
keep the catalog they always had, and switch to ChassidusHub's own on
their own once it is whole: its `2.x` is newer than every `1.x` the reader
made.

The app's "Suggest a fix" and "Report a problem" (its app-core
`fixLinks.ts`) open the site's `/_/app/edit` and `/_/app/report`, which
find the item by the app's ids through `/v1/app/item` (`?farbrengen=` a
mafteiach number, `?work=` and `&unit=` the phone's ids) and send the
reader on to its edit page or a new report.

What goes in:

- **the farbrengens** (`byYear`): every event with a mafteiach number,
  its date key as mafteiach wrote it (from its path, else its date and
  its order that day), its recordings (JEM's file names, parts in order,
  a shiur or chazara kept as such), and its hanachos that are on Drive;
- **the works**: the sefarim with a Sichos-Kodesh id, their authors, and
  the units of each (the phone's unit ids, their place as contents, each
  edition's source, and the sha256 of the text ChassidusHub keeps). What may
  be done with each source is what Sichos-Kodesh decided when its texts
  came in, else ChassidusHub's default for the source and licence;
- **the library**: empty. ChassidusHub does not hold it yet (section 5).

A release is numbered `2.<commit>.0`, the last commit that changed a
farbrengen, recording, sefer, unit or author: newer than every catalog
Sichos-Kodesh numbered itself, and new only when something the apps show
has changed. A release that lacks a part its app shows (today, the
library in `v2` and `v3`) is numbered `0.<commit>.0` and its manifest
says `missing`: the apps take only a newer version, so none swaps its
own library for an empty one. The web app (`v1`) can switch now; the
phone once ChassidusHub holds the library.

Not kept by ChassidusHub, so not in these releases yet: the farbrengens'
short titles (`occasionLabelShort`, `occasionLabelShortEn`), the size of
each text (`bytes`) and of a sefer's texts (`textBytes`), the sha256 of a
unit's second text (an English one beside the Hebrew), the HebrewBooks
shelf (`works.shelf`; the apps then keep their bundled one), and the
registry's own order of the sefarim.
