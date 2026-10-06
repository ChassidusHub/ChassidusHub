# @sichos-kodesh/archive

`sk-archive`: the canonical archive of the Rebbe's Torah media. Every
upstream file the indexers know - JEM's recordings, the hanachos and
maamorim on Google Drive - fetched **once**, directly from CloudFront and
Drive, stored under the SHA-256 of its bytes with provenance, verified on
a schedule, backed up. Everything downstream (`services/pack-builder`,
the download site, the Rebbe Drive, the apps' `objects.json`) builds from
here and never touches upstream again. The plan is `docs/offline-plan.md`.

## The store

```
<root>/raw/objects/<aa>/<sha256>   originals, immutable, one per distinct file
<root>/raw/index.sqlite            the versioned store (src/schema.ts)
<root>/raw/tmp/                    downloads in flight
<root>/derived/<profile>/          encoded audio, written by sk-pack transcode
<root>/packs/                      built packs
<root>/catalog/                    catalog snapshots per release
<root>/keys/                       the signing key (offline copy elsewhere)
```

The index is a small Git-like model rather than a crawl log: `commits`
(author, message, time, `main` / `pending` / `rejected`), `objects`,
`sources` (where each object's bytes came from: url, ETag, when, or why a
fetch failed), `wanted` (the inventory - what every item should have,
from the indexers) and `refs` (item → object as actually stored, with the
commit that added it). The crawler is the bot author `crawl`; the Rebbe
Drive's contributions will be `pending` commits an editor moves to
`main`. A catalog release is a tagged commit, so any version can be
rebuilt. `node:sqlite` (Node 22+), no native modules.

## Inventory

The archive does not crawl mafteiach or JEM's API itself; it reads the
two indexers' databases and fetches the files they point at:

- `packages/jem-index/jem.db`: every recording (8,142; 2,722 h) → audio
  objects, one `jemEvents` item per ccdb event.
- `packages/mafteiach-index/mafteiach.db`: every Drive link by occasion
  and section → PDF objects under `farbrengens`; the occasion ↔ recording
  table → `farbrengens` audio refs to the same objects.
- The same database's section tables, once `npm run crawl-sections` has
  filled them (`src/sectionsInventory.ts`; each reader only runs when its
  table exists):

  | Collection | From | Item id | Role |
  | --- | --- | --- | --- |
  | `likkuteiSichos` | `ls_links` | `{volume}:{page}` | `sicha`, `translated` |
  | `maamorim` | `maamorim_links`, `maamor_jem_audio` | maamar id | `mugah`, `biltiMugah`, `hanachos`, `hagahos`; audio by chapter |
  | `yomanim` | `yomanim` | the Drive file id | - |
  | `hadranim` | `hadranim_links` | hadran id | `mugah`, `biltiMugah` |
  | `michtavimKlolim` | `michtavim_links` | letter id | `{language}:{edition}` (`he:mugah`) |
  | `reshimos` | the pre-Nesius occasions' mugah links | occasion id | `reshimos` |

  Links that are not Drive files (kitzur pages, ashreinu players, Google
  Docs) are counted, not fetched.

A recording that is both a JEM event and a farbrengen chapter is one
object with two refs; a reshima is likewise one object under both
`farbrengens` and `reshimos`.

## Commands

```
sk-archive inventory                       read the indexers (upsert; safe to repeat)
sk-archive crawl [--limit N] [--source jem|drive] [--collection id] [--scope 5736|5736-01] [--dry-run] [--concurrency 2]
sk-archive sync [--limit N]                inventory, then crawl - the nightly job
sk-archive verify [--sample 0.02] [--full] re-hash objects; bad bytes are dropped and re-fetched next crawl (the object and its refs stay)
sk-archive stats [--json]
sk-archive report-unresolved [--json]      files upstream would not give us, by item
sk-archive export-objects-index --catalog-version 1.0.0 [--out objects.json]
sk-archive import-text --collection works --dir packages/sefaria-index/data [--dry-run]
sk-archive import-text --collection igros|maanos --dir <build-igros output> [--dry-run]
```

`crawl --scope` fetches only the files of items dated in a Hebrew year
(`5736`) or month (`5736-01`, `5746-06B`), and `--collection` only one
collection's - what a pack build for that scope needs, without waiting for
the whole archive.

The `derivations` table records each original recording's encoding in a
smaller audio profile (`sk-pack transcode`, services/pack-builder), with
the bytes under `derived/<profile>/`. Derived bytes can always be made
again from the original; `objects.json` lists them under their original's
item and upstream id, with their own profile.

`import-text` stores text that arrives as data rather than as a file to
fetch.

- **`works`**: the seforim `packages/sefaria-index` imports. Each kept
  edition of each unit becomes one object under item `<work>/<unit>`,
  with its own source id (`work:<work>:<hash prefix>`) and role (the
  edition). The url is `text:works/<work>/<unit>@<source id>`, so a unit's
  editions never collide. The commit is by `sefaria-import`. Only texts
  the rights gate lets ship were written by the import, and `sk-pack
  build-work` packs them by the sha256 the catalog names. The first import
  (2026-09-24) stored 2,629 texts, 36.6 MB. A second run added nothing.
- **`igros`, `maanos`**: the letters and maanos that `packages/igros-index`
  builds locally.
Each letter or maaneh becomes one `text` object, a small HTML document
whose sha256 is its identity. It gets a `wanted` row (source
`contribution`, url `text:<collection>/<item id>`) and a ref from its
item, under a commit by `igros-import`. Importing the same build again
adds nothing. An edited text gets a new object, and its item's ref moves
to it. These two collections are gated: the archive keeps them, but no
pack carries them until the rights are cleared
(`packages/catalog/src/rights.ts`).

Global options: `--root` (or `SK_ARCHIVE_ROOT`), `--jem-db`,
`--mafteiach-db` (default: the databases in this repository). From the
repository: `npm run archive -w @sichos-kodesh/archive -- stats`.

Fetching is polite and direct: two connections per host, about one
request a second, exponential backoff on 429/5xx and network errors,
`Range` resume of a cut download, Drive's "can't scan for viruses"
confirm-token page handled, a sign-in page or a 404 recorded as
*unresolved* (see `report-unresolved`; the 259 legacy `0B…` Drive ids
mostly carry a resource key and fetch fine, the rest need re-locating on
mafteiach). A url that keeps erroring is retried on later runs up to a cap.

## First run on the VPS

```
git clone https://github.com/ChassidusHub/ChassidusHub /srv/sk/ChassidusHub && cd /srv/sk/ChassidusHub/sichos-kodesh
npm ci && npm run build -w @sichos-kodesh/archive
export SK_ARCHIVE_ROOT=/srv/sk/archive
node services/archive/dist/bin/sk-archive.js inventory
node services/archive/dist/bin/sk-archive.js crawl --limit 20          # a taste: check stats and report-unresolved
node services/archive/dist/bin/sk-archive.js crawl                     # the lot: ~20,000 files, 40-55 GB, about a day
node services/archive/dist/bin/sk-archive.js verify --full
```

Then install `deploy/systemd/sk-archive-sync.{service,timer}` (nightly
sync, 2% verify on Sundays, `rclone` mirror of `derived/` + `packs/` to
R2, `restic` backup of `raw/`; see `deploy/rclone.example.conf` and
`deploy/restic.env.example`), or run the same through
`deploy/docker-compose.yml`. The indexer databases are the ones in the
repository checkout; re-run the indexers there before `sync` to pick up
new occasions.

## Developing

```
npm test -w @sichos-kodesh/archive        # end to end against a fixture upstream (resume, confirm token, 404, verify)
npm run typecheck -w @sichos-kodesh/archive
```
