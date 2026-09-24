# Sichos Kodesh offline: the implementation plan for this repository

The engineering plan on muse (`muse.shmuky.dev/artifacts/sichos-kodesh-offline-plan/`)
sets the design: content-addressed objects, packs as plain zips with a
signed manifest, delta as set difference, a canonical archive, a download
site and a yeshiva station. This document keeps that design and maps it
onto this monorepo - what already exists, what the research got wrong
because it could only see the deployed web bundle, and the concrete
packages, services, files and milestones, in the order they unblock each
other. Numbers below are recomputed from the data in this repository.

`docs/chabad-library-plan.md` widens the library beyond the Rebbe to all of
Chabad: every Rebbe, the Chassidim and the history, from chabadlibrary.org,
Sefaria and HebrewBooks. Its work packages continue from WP8.

Two reviews by Shmuly extended the scope after the first draft, and this
document carries both:

1. **From "Sichos Kodesh" to all the Rebbe's Torah** (section 2): the
   phone app becomes a library - farbrengens as today, plus Likkutei
   Sichos, maamorim, Igros Kodesh and Maanos Kodesh, reshimos, yomanim,
   general letters, hadranim and every Ashreinu/JEM event - each with its
   own browser, browse axes and auto-download; mafteiach's own list of
   moadim and yemei d'pagra replaces the hand-made lists; and the app
   accepts and produces the plain zips bochurim already pass around.
   **This extension is for the phone app only.** The web app keeps the
   farbrengens experience it has.
2. **The Rebbe Drive** (section 3): Shmuly's own public, versioned archive
   of all the Rebbe's Torah, with accounts, commits, history, access
   control and Wikipedia-style review - a new pillar of the network
   alongside the download site, not a replacement for it and not GitHub.

## 0. What is true in this repository today

The research read `sk.shmuky.dev`'s JavaScript. The mobile app, the
indexers, the catalog release pipeline and the proxy live here, and several
of the plan's assumptions change once they are in view.

| Area | State today | Where |
| --- | --- | --- |
| Catalog | 43 years (5710-5752), 3,330 occasions, 6,454 tracks (6,433 unique files, **1,999 h**), 13,975 PDF refs (12,656 unique Drive files). Versioned (`CATALOG_VERSION` 1.0.0, schema 1) with its own changelog and `catalog-v*` tags. | `packages/catalog` (`src/version.ts`, `src/release.ts`, `bin/release.ts`) |
| Catalog updates | Both apps fetch a newer catalog from **api.sk.shmuky.dev** (live: `services/catalog-api`, Vercel) once a day and apply it in place through a mutable catalog store. Mobile stores it as `DocumentDir/catalog-release.json`. | `packages/app-core/src/catalog/*`, `apps/mobile/src/catalog/*`, `apps/web/src/catalog/*` |
| Indexers | `mafteiach-index` (occasions, links by section, resolved JEM audio) and `jem-index` (JEM's own ccdb: **8,941 events, 8,142 recordings, 2,722 h**, 5709-5752). Both are SQLite files in the repo. | `packages/mafteiach-index`, `packages/jem-index` |
| Media proxy | One Cloudflare Worker: `/jem-audio/:filename` (JEM CloudFront) and `/drive/:fileId?resourcekey=` (Google Drive). Forwards `Range`, exposes `Content-Range`. | `services/media-proxy` |
| Mobile app | **Bare React Native 0.87** (Kotlin native modules), not a WebView. Audio: `react-native-track-player` (Media3/ExoPlayer) playing `file://` paths directly. PDFs: `react-native-pdf` from `file://`. Downloads: a Kotlin **WorkManager** worker with `Range` resume, files stored as `DocumentDir/<workerFilename>` and `DocumentDir/<driveFileId>.pdf`, records in AsyncStorage (`StoredDownloadRecord{key, localPath}`), a ledger of auto-downloads, weekly background sync (headless JS), notifications, deep links. The resolver indirection the plan asks for **already exists**: `resolveTrackUrl(workerFilename)` and `localPdfPathIfExists(driveFileId)` return the local path or the proxy URL. | `apps/mobile/src/download/*`, `src/player/playlist.ts`, `android/.../download/*.kt` |
| Web app | Vite PWA; media in the Cache API (`media-proxy-cache-v3`, `maxEntries: 5000`) via a cache-first route plus an explicit download manager. | `apps/web/src/download/*`, `vite.config.ts` |
| Releases | Signed APKs built by the "Android Signed Release APK" workflow and published as GitHub Releases (`v<version>`), ARM only, ~25 MB per ABI. | `.github/workflows/android-release-apk.yml` |

Consequences for the plan:

- **No custom URL scheme, no WebView, no Cache-API quota problem on the phone.** The native app already keeps media as files and hands paths to the player and the PDF view. The phone work is a file-store refactor plus an import worker, not a new serving layer.
- **The catalog channel already exists.** A pack does not need to carry the catalog to bring new occasions; `api.sk.shmuky.dev` does that when there is connectivity, and a pack can carry a `CatalogRelease` for phones that never connect - applied through the same `parseCatalogRelease` / catalog store, no new code path.
- **The download taxonomy is shared.** `packages/app-core/src/download/downloadTargets` already turns (entry, settings) into the list of files to fetch; the pack builder and the download site reuse it server-side so "what is in a pack" and "what the phone would download" are the same function (`sizeSelection` in `packages/pack-format`).
- **The archive's audio inventory comes from `jem-index`, not the catalog.** See the hours question below.

### Answers to the research's open questions, from the repo

1. **Mobile wrapper**: bare React Native (Android only today), Kotlin for
   downloads, background sync and notifications. Design the object store as
   files in app-private storage and the import as a WorkManager worker,
   the same pattern as `DownloadWorker.kt`.
2. **2,722 vs 1,999 hours**: both are right. JEM's ccdb has 8,142
   recordings (2,722 h). The catalog only carries the 6,454 recordings that
   mafteiach links to an occasion (1,999 h). The other **1,709 recordings
   (723 h)** are JEM events mafteiach does not list (5709, side events,
   unlinked farbrengens). The archive crawls all 2,722 h from `jem.db` as
   the `jemEvents` collection; the farbrengens collection covers 1,999 h,
   and the JEM-only events become browsable with catalog schema 2.
3. **Legacy Drive IDs**: `mafteiach.db` has 328 links to `0B…` IDs, 253 of
   them **with** a `resourcekey`; the catalog carries the key on 252 PDF
   refs. The 502s the research saw are most likely the 75 keyless links
   plus Drive throttling through the Worker. The archive crawler fetches
   Drive directly with the key and reports the residue per item
   (`sk-archive report-unresolved`) so it can be re-located on mafteiach.
   No app change.
4. **Device matrix**: still needed from Shmuly (section 6).
5. **Key custody / third-party packs**: decided, section 6.
6. **Listening test**: scheduled inside WP3, before any Opus profile is
   locked; the first pack ships original bytes so nothing waits on it.

## 1. Design decisions (adopted from the muse plan, adjusted)

**Object.** One file, named by the SHA-256 of the bytes the phone will
store. For PDFs that is the original Drive bytes. For audio it is the
bytes of the chosen *profile*: `src` (the original MP3, no transcoding),
`opus24`, `opus32`, `opus16`, `mp3-32` (for dumb players). Text (a letter,
a maaneh, a transcript) is a UTF-8 HTML fragment stored the same way, so
the whole Igros corpus is one ~40 MB pack and the app needs one reader.
The first release uses `src` only: it needs no encoder, keeps object
identity equal to the archive's raw hash, and lets the app, import flow
and station ship before the codec question is settled. Opus profiles
follow the listening test and roughly halve the bytes.

**Pack** (`.skpack`). A plain ZIP, entries *stored* (no compression),
`manifest.json` first, then `objects/<sha256>`, optionally `objects.json`
(the objects index the pack was built against) and `catalog.json` (a
`CatalogRelease`). Any file manager opens it; Android streams it with
`ZipInputStream`; a truncated copy fails verification before anything is
written. Big scopes split into numbered parts, each valid alone.

**Manifest.** `packages/pack-format/src/manifest.ts` is the contract
(implemented, tested; the shape in the first draft of this document was
keyed to farbrengens only and grew with the library):

- `PackEntry { collection, itemId, hebrewYear?, hebrewDate?, label?, refs }`
  - one item of one collection. Farbrengens are keyed by the mafteiach
  occasion id, the other collections by their own stable ids.
- `ObjectRef { sha256, bytes, kind: audio|pdf|text, profile?, sourceId, role?, label?, durationMs? }`
  - `sourceId` is the id the apps already use (JEM `workerFilename`,
  Drive `driveFileId`, a text id) and `role` is the PDF section, the
  audio chapter index or the text role, so a pack maps onto the catalog
  without a lookup table.
- `scope { kind: month|year|occasions|volume|custom, collection, hebrewYear?, month?, volume?, label {en, he} }`,
  `objects` (sha256 → bytes for every object in this pack or part),
  `part`, `catalog` / `objectsIndex` stamps, `signature`.

`have.json` on the phone is `{ schema, appVersion, catalogVersion,
profiles, objects: [sha256...] }` plus `device.json` (model, Android
version, free bytes, last import).

**Signing.** Ed25519 (`tweetnacl`) over the canonical JSON of the manifest
without `signature`; `keyId` is derived from the public key, so a second
trusted key is a one-line addition to `TRUSTED_PACK_KEYS`. Shmuly
generates the key (`sk-pack keygen`, WP3) and keeps the secret offline;
only the public key is committed. Until then the vitest fixtures use a
test key, clearly named as such. The phone verifies the manifest in JS
(tens of KB) and every object's SHA-256 natively while streaming the zip.
Unsigned or foreign-key packs are refused *as packs* - their files can
still come in as loose files, below.

**Delta.** Set difference over `have.json`. No server ever knows a device.

**objects.json and community zips.** Bochurim already pass zips around,
one per month or year. The trust anchor for a file without a manifest is
the **objects index**: everything the archive holds, by hash, with what
each object is (kind, profile, upstream id, collection, item; ~60k
entries, ~1.5 MB gzipped), versioned and served like the catalog from
api.sk.shmuky.dev, embedded in every `.skpack`, bundled in the APK. A
file whose hash is in the index is the right bytes by definition, so an
unsigned zip or a plain folder is imported by hashing every file: known
hashes are stored and attached; unknown files are matched by filename
heuristics (`JEMSK####A.mp3` / `AR#######.mp3`, a Drive id in the name,
our own export names) and kept as *unverified* attachments only when the
folder gives a scope (`5748/01`, `תשמ"ח/תשרי`); the rest is skipped with
a count. `identifyFile` and `importPlan` in `pack-format` are that logic,
pure and tested, shared by the phone, the site and the station. The app
also **exports** a month or a year as a plain zip with a manifest and
Hebrew folder names, so what bochurim pass around is already our format.

**Sizes** (from the catalog's own durations; PDFs at ~430 KB mean; the
research's table, unchanged):

| Scope | Hours | `src` (source MP3, ~40 kbps avg) | `opus24` | `opus32` |
| --- | --- | --- | --- | --- |
| Median month (5744 Cheshvan) | 3.4 | ~80 MB | 57 MB | 69 MB |
| Tishrei 5736 | 5.6 | ~105 MB | 74 MB | 94 MB |
| Largest month (5748 Tishrei) | 20.5 | ~380 MB | 250 MB | 323 MB |
| Whole catalog, audio only | 1,999 | 35-55 GB | 21.6 GB | 28.8 GB |
| Whole archive (JEM), audio only | 2,722 | 48-75 GB | 29 GB | 39 GB |
| All hanachos | | 6 GB | 6 GB | 6 GB |

## 2. The library: all the Rebbe's Torah (phone app only)

mafteiach.app has more than the dated farbrengens the indexer crawls
today (the indexer's README already maps them): **Likkutei Sichos**
(`/likkutei_sichos/by_volume/{n}`, `by_parsha`, `by_moad`, per-sicha
ids), a standalone **Maamorim** index (`/maamorim`, fragment ids),
**Hadranim** (`by_masechta`, `by_year`), **general letters**
(`/michtavim_klolim_new`, by moed), **Yomanim** (`/yomanim/by_year`), and
**Reshimos** (no section on the site - probed, 404; they are the
pre-Nesius entries' "רשימות" text, 102 occasions, and become their own
collection from that data). Probed live: `/likkutei_sichos/by_volume/1`
and `/maamorim` render fully server-side; yomanim, hadranim and
michtavim redirect to their default view. Ashreinu/JEM holds ~80 event
types beyond farbrengens (tefillos, children's rallies, general
audiences, yechidus/dollars, kos shel brachah, ...) plus 1,278
transcripts, long descriptions, links and playlists; all 8,142
recordings are already in `jem.db`.

**Igros Kodesh and Maanos Kodesh.** Source: the Flutter "Igros" APK
Shmuly linked (downloaded and inspected):
`assets/flutter_assets/assets/data.sqlite`, table `Igroys1` with
**11,059 letters** (volume, page, date line, city, addressee, full letter
text as HTML, signature, editor's comment, one-line summary, book page),
`tags.sqlite`/`tags.json` with **642 subject tags**, and
`miniletters.zip` with **מענות קודש 5742-5752** (11 JSON files, per
year: number, Hebrew date, response text). The APK also carries payment
assets, so it is a commercial product: **permission from its publisher is
a decision before this text ships in packs** (section 6). mafteiach's own
igros section was not found by probing or in its navigation templates;
the crawler locates it in WP2b if it exists, and the general letters are
crawled regardless.

**Moadim and yemei d'pagra from mafteiach.** `/all/moadim/<slug>` exists
for **~100 moadim**: every Yom Tov and its erev, Rosh Chodesh of each
month, the Chabad dates (Yud Shevat, Yud-Tes Kislev, Beis Iyar, Chof Av,
...), the four parshiyos, Shabbos Chazon / Nachamu / Selichos / Teshuva /
Hagadol, rallies, yechidus days, Kinus Hashluchim, camps, N'shei Chabad,
Machane Yisroel. That list, with mafteiach's Hebrew names and its
per-moed occasion membership, ships in the library (`moadim`, with
`occasionMoadim()` and friends in `packages/catalog/src/library/`) and
replaces the hand-made `SPECIAL_DAYS`, `CHAG_CATEGORIES` and the search
dropdowns on the phone (WP4b); `/all/parshiyos/<parsha>` gives the parsha
assignment per occasion the same way (today it is computed from the
date). The hand lists stay for the web app, under their old names, so
nothing changes there.

**Browse axes.** The farbrengens browser gains by parsha, by moed and by
month next to by year/date. The maamorim view gets by year → month →
date (mafteiach's own structure, with hemshech and kuntres labels), by
**the six Melukat volumes** (from the printed citations: 213 links cite
`סה"מ מלוקט ח"א-ו` explicitly, 2,191 cite ספר המאמרים; the crawler
records the citation per maamar), by month and by date, plus
dibur-hamaschil search. Igros: by volume, by year/date, by subject tag,
full text. Yomanim by year; michtavim by moed/year; hadranim by masechta;
JEM events by date and type.

**Catalog schema 2: the library.** A schema-2 release is the farbrengens
exactly as today (`byYear`, byte for byte, so every existing screen,
download record and progress key is untouched) plus `library` next to
them. Each collection has its own item shape and browse axes (`groups`),
but every item exposes the same `refs` (a Drive PDF, a JEM recording, a
text object) so downloads, packs, search and "downloaded" state stay
generic: `likkuteiSichos` (volume, page, parsha/moed section, availability
flags, links), `maamorim` (dibur hamaschil, date, year, Melukat volumes,
printed citations, the farbrengen it was said at, its own JEM audio),
`reshimos`, `yomanim` (by year), `michtavimKlolim` (by moed / year),
`hadranim` (by masechta / year), `jemEvents` (every JEM event with audio,
by year and type, with the catalog occasion when mafteiach lists it),
later `igros` and `maanos` (gated); plus mafteiach's `moadim` and
`parshiyos` with the farbrengen occasions each lists. The phone bundles
it as one JSON file per collection, read on first use (`require` inside a
function, which Metro allows), so start-up does not pay for it. Schema 2
needs an app release (apps only apply their own schema; that rule exists
for exactly this): `CATALOG_SCHEMA_VERSION` stays 1 for the web, and a
separate `CATALOG_LIBRARY_SCHEMA_VERSION = 2` is the phone's. The catalog
API serves schema 1 to the web app (`/v1/catalog/...`) and schema 2 to the
phone (`/v2/catalog/...`), keeping one copy of the farbrengens for both,
so neither app breaks the other.

**Text rights.** Likkutei Sichos: bibliographic facts, availability flags
and links only, until it is settled which text on mafteiach is its own
editorial writing. Igros / Maanos: the index can be built and tested
locally, but nothing ships in a catalog release or a pack before the
publisher's permission (section 6).

## 3. The Rebbe Drive and the network

Shmuly's own public archive of all the Rebbe's Torah, at
`drive.sk.shmuky.dev`, that works like GitHub and Wikipedia at once:
everyone can browse and download, accounts can propose changes, editors
approve, every change is a commit with history, and access is by role. It
adds to the download site; it does not replace it.

- **Versioned store from day one (WP2, implemented).** The archive's
  database is not a flat crawl index but a small Git-like model:
  `commits` (id, parent, author, message, time, status `main` |
  `pending` | `rejected`), `objects` (sha256, bytes, kind, profile, mime,
  the commit that added it), `sources` (provenance: upstream url, ETag,
  when, or why a fetch failed), `wanted` (the inventory from the
  indexers: what every item should have), `refs` (item → object with
  role, label, order, the commit that added it and, when upstream
  replaced the file, the commit that retired it) and `verifications`.
  The crawler is the bot author `crawl`; a catalog release is a tagged
  commit; `objects.json` and `catalog.json` are built from a commit, so
  any version can be rebuilt.
- **Contributions (Wikipedia-style pending changes).** A signed-in
  contributor adds a file (hanacha PDF, recording, transcript) or edits
  metadata (date, label, section, addressee) on any item, or proposes a
  new item; the change is a `pending` commit with the uploaded object
  already stored under its hash. Editors see a review queue with a diff,
  approve (the commit moves to `main`, provenance kept: "נוסף על ידי …")
  or reject with a note. Per-collection policy: open (edits go live,
  review after), moderated (default), locked (rights not cleared, e.g.
  Igros until permission). Item history and revert; talk notes per item;
  audit log; rate limits.
- **Access control.** Roles: anonymous (read, download, packs),
  contributor (propose), editor (approve, edit live in open collections),
  admin (roles, policies, signing key). Accounts by email magic link or
  passkey; no passwords stored. Per-collection overrides.
- **Surfaces.** `apps/drive`: a Hebrew RTL web UI (Vite, shared design
  tokens) - browse by collection like a drive, item pages with files and
  history, pack builder (exact size, scope/profile/sections), review
  queue, account/roles. `services/drive`: the API (Node/Hono on the VPS
  next to the archive, SQLite via `node:sqlite` first, Postgres when
  needed), R2 for public object delivery and uploads (presigned PUT, hash
  verified server-side). The phone gets "הוסף הנחה / הצע תיקון" on an
  item: queued offline, uploaded when online, then reviewed on the Drive
  like any other contribution.
- **Packs and releases** come from the Drive's main branch:
  `sk-pack catalog-bundle --commit <id>` builds the catalog and
  `objects.json`; api.sk.shmuky.dev serves what the Drive tagged.

The network, in one picture:

```
 upstream sources ──crawl (bot commits)──►  ARCHIVE (versioned store on the VPS, objects by hash)
 contributors ──Drive: propose / review──►      │            ▲
                                                ▼            │ approved contributions
                                   catalog + objects.json     │
                                                │            │
                    ┌───────────────────────────┼────────────┴──────────┐
                    ▼                           ▼                       ▼
            api.sk.shmuky.dev            download site + packs     Rebbe Drive (public,
            (apps' catalog updates)      (prebuilt / custom)       browse, history, contribute)
                    │                           │
                    ▼                           ▼
              phone / web app  ◄──USB/zip──  yeshiva station  ◄──overnight sync──┘
              (library of collections, offline; community zips between bochurim)
```

Every arrow is content-addressed and versioned; nothing on a phone ever
needs a socket, and everything a phone holds can be traced back to a
commit in the archive.

## 4. Work packages and deliverables

### WP1 - `packages/pack-format` (done, PR #105)

`@sichos-kodesh/pack-format`, dependency-light (`tweetnacl` only), used by
everything that makes or reads packs:

- `manifest.ts`: collection-aware `PackManifest`, `PackEntry`,
  `ObjectRef`, `PackScope`; `parsePackManifest` never throws (a truncated
  or foreign file is "not a pack"); entry names and ids.
- `canonical.ts`, `signing.ts`: canonical JSON, Ed25519 sign / verify,
  `TRUSTED_PACK_KEYS`, `keyIdFor`, `generateKeyPair`.
- `objectsIndex.ts`: the `objects.json` schema and a source lookup.
- `have.ts`, `delta.ts`: `HaveFile`, `DeviceFile`, `computeDelta`,
  `choosePacks` (prebuilt packs by gain, no double counting).
- `identify.ts`: `identifyFile` (by hash, then by name: JEM, Drive, our
  export names), `parseFolderScope` (`5748/01`, `תשמ"ח/תשרי`),
  `importPlan` for community zips and folders.
- `selection.ts`: `sizeSelection` on `app-core`'s `listDownloadTargets`.
- 20 vitest tests with a fixture pack and a fixture community zip; README
  documents the format.

### WP2 - `services/archive` (`sk-archive`) (done, PR #105)

One place that holds every upstream byte, verified, so nothing downstream
ever fetches JEM, Ashreinu or Drive again. Node CLI on `node:sqlite`
(Node 22+, no native modules), reading its inventory from the two
indexers' databases.

- Store: `raw/objects/<aa>/<sha256>` immutable originals,
  `raw/index.sqlite` (the versioned schema of section 3), `raw/tmp/`,
  `derived/`, `packs/`, `catalog/`, `keys/`.
- Commands: `inventory` (upsert from `jem.db` - all 8,142 recordings as
  `jemEvents` items, `farbrengens` audio refs from the occasion ↔
  recording table - and `mafteiach.db` Drive links by occasion and
  section), `crawl` (`--limit`, `--source`, `--dry-run`, `--concurrency`),
  `sync` (inventory then crawl: the nightly job), `verify` (2% sample or
  `--full`; bad bytes are dropped and re-fetched next crawl, the object
  row and its refs stay), `stats` (including objects whose bytes are
  currently lost), `report-unresolved` (per item: the legacy Drive
  residue), `export-objects-index`.
- Fetching: direct from CloudFront and Drive, two connections per host,
  ~1 req/s, exponential backoff on 429/5xx and network errors, `Range`
  resume of a cut download, Drive's confirm-token page, sign-in pages and
  404s recorded as unresolved, a retry cap per url.
- One commit per crawl run; a url whose bytes change upstream retires the
  old refs at that commit and adds the new ones.
- `deploy/`: Dockerfile, docker-compose, systemd service + timer (02:30
  nightly sync, Sunday 2% verify, `rclone` mirror of `derived/` +
  `packs/` to R2, `restic` backup of `raw/`), rclone and restic examples.
- End-to-end vitest against a fixture upstream (resume, confirm token,
  sign-in page, 404, dedupe across collections, verify and re-fetch).

Acceptance on the VPS: `sk-archive stats` reports 8,142 audio objects and
~12,650 PDF objects, `verify --full` clean, the unresolved report under 1%
of PDF refs, and a second `sync` fetches nothing. The README has the first
run (`crawl --limit 20` first).

### WP2b - indexers for every section + catalog schema 2 (done, PR #107)

Three PRs: **A** the sections indexer and the archive's readers, **B**
catalog schema 2 with the API's `/v2/` and the phone's store (no
screens), **C** the igros index (gated).

- (A) `packages/mafteiach-index/src/sections/`: crawlers for
  `likkutei_sichos` (by volume; the parsha/moed views as membership),
  `maamorim` (by year, the six Melukat volumes, fragments with the printed
  citation per maamar), `yomanim`, `hadranim`, `michtavim_klolim_new`;
  `moadim` (`/all/moadim/<slug>`, all 101 slugs with Hebrew names and
  occasion membership) and `parshiyos`. Crawl and sync are one command
  (conditional GETs through the existing ETag cache). Bibliographic facts,
  availability flags and links only. Reshimos are derived from the
  pre-Nesius entries' links.
- (A) The archive's inventory has one reader per collection, so the
  crawler fetches the new objects with the next `sync`.
- (B) `packages/catalog/src/library/`: `buildLibrary()`, the item types,
  lookups (`occasionMoadim`, `occasionParshiyos`, `libraryItem`) and
  validation; `bin/build.ts` writes `data/library/`, `bin/release.ts`
  emits the schema-2 pair next to schema 1; app-core's store and updater
  take an optional library and a schema; `services/catalog-api` serves
  `/v2/`; the phone switches to schema 2. The web app is untouched.
- (B, later) `objects.json` next to `catalog.json` once the archive has
  hashes to put in it (WP3).
- (C) New `packages/igros-index`: reads the Igros app's `data.sqlite`,
  `tags.json` and `miniletters.zip` (kept out of git; a documented local
  input like `mafteiach.db`) into per-volume / per-year JSON with cleaned
  HTML: 11,059 letters in 28 volumes (numbered from the printed numeral,
  which also fixes 7 slips in the source's own numbering) and 3,761
  maanos in 11 years. Gated on the publisher's permission:
  `packages/catalog/src/rights.ts` holds the gate. `build-catalog
  --igros` builds the two collections into a folder of their own. A
  release refuses them, and so will the pack builder. `sk-archive
  import-text` stores each letter and maaneh as a text object.
- (later) `packages/jem-index`: transcripts, links, playlists per event.
- Acceptance: every section crawled with counts in the README; the
  farbrengens data is byte-identical to today's (checked by rebuilding
  and diffing against both apps' bundled copies).

### WP3 - `services/pack-builder` (`sk-pack`) (done)

- `keygen` (Shmuly runs it; the public key goes into
  `TRUSTED_PACK_KEYS`), `transcode` (idempotent, parallel `ffmpeg -ac 1
  -c:a libopus -b:a 24k -vbr on -application audio -frame_duration 60`,
  Nigun-labelled tracks one profile up), `build --scope 5736-01 --profile
  src --sections audio,biltiMugah:sichosKodesh,mugah --max-mb 200`
  (concatenate existing objects into a stored zip, write and sign the
  manifest), `split`, `verify`, `index` (writes `index.json`: id, hash,
  bytes, catalog version, profile, scope - what the site and the station
  read), `upload` (R2), `catalog-bundle --commit <id>`.
- Prebuilt matrix: every source-month at `src` first (≈ 524 packs, ~45
  GB), then `opus24` / `opus32` after the listening test; "this year's
  kvius", "every Tishrei", "every Yud Shevat"; per-volume and per-year
  packs for each collection as WP2b lands.
- The listening test: one sicha, one nigun-heavy track and one crowd
  segment at 16/24/32 kbps, sent to Shmuly as files; the default profile
  is chosen from that, not assumed.

Milestone M1: one `5736-01-tishrei-src.skpack` (~105 MB), verified by
`sk-pack verify`, `unzip -l` showing stored entries, manifest hashes equal
to `sha256sum` of the extracted objects.

**Done (2026-09-24).** `sk-pack keygen / transcode / build / verify /
index` are in `services/pack-builder`, and `sk-archive crawl` gained
`--scope` and `--collection`. M1 passed on real files:
- The Tishrei 5736 pack is 11 occasions, 33 objects and 82.4 MB with the
  plan's sections. It builds in about a second.
- `sk-pack verify` is ok, `unzip -v` shows every entry Stored, and
  `sha256sum` of all 33 extracted objects equals the manifest.
- A 30 MB split gives 4 valid parts.
- `transcode --profile opus24` encodes bit-exact: the same original always
  gives the same hash.

One finding changes the size table below: the JEM originals are already
32 kbps mono MP3 for speech (64 kbps for some nigunim). So opus24 saves
about a quarter, not two thirds (Tishrei: 82.4 MB `src`, 61.7 MB
`opus24`), and `opus16` is where the real saving is. The listening-test
files (a sicha, a nigun and crowd singing, 90 s each, at 16/24/32 kbps
next to the original) were sent to Shmuly, and he hears no difference
between them. The measurements agree. The tapes carry almost nothing
above 8 kHz: in the sicha, the energy above 8 kHz is about 50 dB below
the whole. Opus at 16 kbps keeps that band, and each encode's energy above
4 kHz and above 8 kHz is within about 1 dB of the original's. So `opus16`
(nigunim one step up) is the candidate default. It becomes the default
once Opus plays on real phones (WP4 item 5). Until then, packs stay
`src`. `upload` (R2) and `catalog-bundle` became WP5's `sk-pack publish`.

### WP4 - the phone: object store, import, community zips, export (`apps/mobile`) (built; device check open)

1. **Object store + index.** `files/objects/<sha256>` in app-private
   storage with an index `(kind, sourceId, profile) -> sha256`. The
   existing resolver gains one step: object store, then the legacy
   `DocumentDir/<name>` file, then the proxy URL. The streaming
   downloader keeps working and moves its file into the store under its
   hash on completion; a one-time migration hashes the legacy files.
   `StoredDownloadRecord.localPath` keeps pointing at the stored path, so
   every screen that shows "downloaded" state is untouched.
2. **Import.** `Documents/SichosKodesh/` (`import/` for packs and zips,
   `state/` for `have.json` + `device.json`, `export/` for what the app
   writes). Access through the Storage Access Framework tree picker once
   (persisted URI permission), `MANAGE_EXTERNAL_STORAGE` as the fallback
   on Android 11+ ROMs that expose it. A Kotlin `PackImportWorker` (same
   shape as `DownloadWorker`) streams each `*.skpack` with
   `ZipInputStream`, verifies `manifest.json` (signature in JS, hashes
   natively per entry), writes objects the store lacks, skips the rest,
   deletes the pack, writes `have.json` / `device.json`. Triggers: app
   resume, "ייבוא חבילות" in Settings > Offline, USB disconnect.
   Progress in Hebrew, one line. Needs ~1x pack size free, not 2x.
3. **Catalog from a pack.** When a pack carries `catalog.json` newer than
   the phone's, apply it through the existing catalog store. The daily
   `api.sk.shmuky.dev` check stays: silent, free offline.
4. **Community zips and export.** The same worker accepts any `.zip` or
   folder: hash every file, attach known hashes through `objects.json`,
   apply the `pack-format` heuristics for the rest, report "31 קבצים
   נוספו, 4 לא זוהו". Export: "שיתוף חודש/שנה כקובץ" writes a plain zip
   with a manifest and Hebrew folder names into `export/`. Hashing runs
   natively (~100-300 MB/s), with progress.
5. **Opus playback.** Verify seek and background playback with a real
   `.opus` object on the emulator and on two real kosher phones before
   `opus24` packs are built for the public.

UI: Settings > Offline gains the folder chooser, import and export;
About lists installed packs. Milestone M2: the APK plus the Tishrei pack
copied by hand plays offline with no station; a zip exported on one phone
imports on another.

**Built** (`apps/mobile/src/offline/`, `PackModule.kt`; the mobile README
has the details). Items 2 to 4 are done. Item 5 waits for real phones.
Where the build differs from the text above:

- **Objects stay at the downloader's paths.** An imported object lands
  where the downloader writes, at `DocumentDir/<workerFilename>` or
  `<driveFileId>.pdf`, not under `files/objects/<sha256>`. It gets a
  `StoredDownloadRecord`, so no resolver or screen changed. The index by
  hash is `offline/held-objects.json`. It is what `have.json` lists, and
  imports use it to dedupe. Downloads are hashed into it the first time
  `have.json` is written (the one-time migration), then incrementally.
- **Only `src` audio for now.** A pack in another profile imports its PDFs
  and counts its recordings as "a format this version does not play yet".
  One line in `placement.ts` opens Opus once item 5 passes.
- **Untrusted packs still bring their files.** Release builds trust only
  `TRUSTED_PACK_KEYS`: the production key `aac79a9724647680`, made on
  2026-09-24 (mobile 1.6.0 is the first build that trusts it).
  A pack signed with any other key, or unsigned, is imported as a shared
  ZIP, and its manifest names the `objects/<sha256>` entries the way a
  file name would. Each entry must hash to its name, and each file is
  kept unverified: a signed copy replaces it later. Debug builds also
  trust the published development key (`sk-pack keygen --dev`).
- **A shared file known only by its name** is kept when the catalog lists
  its id, rather than when its folder gives a scope. The catalog is the
  stronger check, and the id places the file exactly.
- **Triggers**: launch, every return to the foreground, and "ייבוא
  חבילות". There is no USB-disconnect receiver. The station user unplugs
  and opens the app, which is the resume trigger.
  `MANAGE_EXTERNAL_STORAGE` is not requested: the Storage Access Framework
  folder is enough.

Not verified here: a device run. This container has no `/dev/kvm`, so
there is no emulator. What was verified: Java's `ZipInputStream` streams
the real M1 Tishrei pack (manifest first, 33 objects, every hash
matching). The export writer's stored ZIP passes `unzip -t` with Hebrew
paths. The JS runs end to end in Jest against a fake native module, with
a pack signed by the development key. M2 on a real phone is Shmuly's
check.

### WP4b - library browsers + per-collection auto-download (phone only; after WP2b)

Home becomes a library (ספרייה): farbrengens (everything that exists
today, unchanged, plus by parsha / moed / month views), then one browser
per collection with the axes of section 2. Text collections open in one
RTL reader component (font size, dark mode, share). The search screen's
chag / special-day dropdowns are rebuilt from `moadim.ts`. Shared row
conventions (download icon, finished state, share), a collection filter
in search, and **auto-download per collection** in Settings > Offline:
farbrengens keep the week/month/year logic; Likkutei Sichos "this week's
parsha"; yomanim/michtavim "this year's dates"; maamorim "this month".
Lands collection by collection, farbrengens first so nothing regresses;
ships as a mobile release through the signed-APK workflow.

**Part 1 built** (`apps/mobile/src/library/`, `src/screens/library/`).
Home has a "Library" row leading to:

- the farbrengens by mafteiach's moadim and parshiyos;
- one browser per collection (Likkutei Sichos, maamorim, reshimos,
  yomanim, michtavim, hadranim, every JEM event), with the collection's
  axes as tabs. The disputed "חלק מ" is set apart at the end of Likkutei
  Sichos' volumes, with a note;
- an item page with its facts (hemshech, kuntres, printed citations,
  date lines, languages), a link to the farbrengen it was said at, its
  recordings, and its PDFs.

Recordings play in the existing player under a negative playlist id of
their own, so their progress never mixes with a farbrengen's chapter
indexes. PDFs open in the viewer's library mode.

Library items also download. Each item has a Download pill; storage
usage and "Delete all" cover library files; the Downloaded screen lists
the items that are fully downloaded.

Auto-download per collection is built too. It follows the farbrengens'
source year(s), and each collection has its own switch in Offline &
downloads, off until turned on:

- Likkutei Sichos: this week's parsha, matched to hebcal's list by
  position (both are in Torah order, 54 each);
- maamorim and yomanim: this month;
- general letters: the current moed.

The background task queues them with the farbrengens, and auto-cleanup
prunes them the same way.

Search is built too (mobile 1.4.0):

- **Search in.** It picks the farbrengens or one collection. A collection
  is searched by each item's name and by the line under it (where and
  when it was said), in both languages, with the same Fuse settings as the
  farbrengens. A year narrows it.
- **Parsha and moed dropdowns.** They list mafteiach's own 53 parshiyos
  and 101 moadim, replacing the date-math parsha, chag and special-day
  lists. A choice passes the occasions mafteiach files there to app-core's
  `searchOccasions` (`occasionIds`), so the web's search is unchanged. A
  parsha or chag typed into the box is still read as before.
- **English names.** Catalog 1.2.0 gives the moadim and parshiyos English
  names (`nameEn`), used in the English interface. Most come from the
  occasion-label rules, and a table covers the 30 headings they do not
  read.

The text reader came later: the seforim reader (WP13, WP15), which reads the Igros too since their rights were cleared (WP17 in docs/chabad-library-plan.md).

### WP5 - `apps/download` + `services/pack-api`

- `apps/download`: a small Vite site in Hebrew RTL on the shared design
  tokens. Picks collection, scope (year, month, occasion, volume, date
  range, this year's kvius), profile, sections and editions; the size is
  exact because every object's size is in `index.json`. Over the target:
  split into N parts or auto-trim in a fixed order (hosofos, hagahos,
  duplicate editions, lower profile, whole occasions by size). Prebuilt
  packs are one click.
- `services/pack-api`: a Cloudflare Worker over R2 with a Queue for
  custom builds (a build is a concatenation, seconds), cached by selection
  hash, signing with the key as a Worker secret. Serves `index.json` for
  the station. Deployed like `services/media-proxy` (wrangler).

**Built; not deployed.** The pieces are `services/pack-api`,
`apps/download`, `sk-pack publish` and `sk-pack serve`, and each README
has the details. Where the build differs from the text above:

- **No queue and no build cache.** A custom pack is streamed, not built.
  At publish time, `sk-pack publish` records every object's size and
  CRC-32 in a per-year shard, `index/<year>.json`. With those, the Worker
  writes each stored-ZIP header before the object's bytes and knows the
  exact `Content-Length` before the first byte. It reads only the
  selection's year catalog, its shard and the objects.
  - The URL is the selection, and a build is dated to the publish time,
    so a CDN caches builds by URL. There is nothing to queue or store.
  - pack-format's `zipLayout` and `packPlan` are shared with `sk-pack
    build`. A test proves the two write byte-identical packs.
- **The publish layout** (`services/pack-api/src/layout.ts`) is
  `meta.json`, `catalog/<year>.json`, `index/<year>.json`,
  `objects.json`, `objects/<sha256>` and `packs/`. The station reads the
  same `meta.json`, `objects.json` and `packs/index.json`.
- **`sk-pack serve`** runs the same handler over a published directory:
  for local development, and for a server with no cloud at all.
- **The site's first version** picks farbrengens only, by year and month.
  It chooses the sections (the essentials, everything, or a custom set),
  the audio profile, and the largest file wanted.
  - Over that size, the pack splits into parts, each downloaded on its
    own. Auto-trim is not built.
  - Other collections, a date range and this year's kvius come later, on
    the same API.

Verified locally: `sk-pack publish` on the M1 archive (61 objects, `src`
and `opus24`), then `sk-pack serve`, then a streamed Tishrei 5736 `opus24`
pack (61.7 MB). `sk-pack verify` passes on it. The site against that
server shows the exact size of each selection.

Deploying needs:

- a Cloudflare account with R2;
- the archive published and synced to R2 (`rclone`);
- the real signing key, stored as the Worker secret.

M3 is done when a pack downloaded from the public site imports on a phone.

### WP5b - the Rebbe Drive (`apps/drive`, `services/drive`; after WP5)

Section 3: the UI, the API, accounts and roles, the review queue, item
history and revert, the phone's "הוסף הנחה / הצע תיקון". Shares WP5's
backend and R2; about six weeks.

### WP6 - the yeshiva station (`apps/station`)

Windows first (the office PC), built with Tauri: a small binary, Rust
talking to the Windows Portable Devices API for MTP, the web UI reusing
the design system and `pack-format`. Overnight: pull `index.json`,
download new packs for the configured scope, verify hashes into a local
mirror. Plug-in: read `state/device.json` and `state/have.json`, compute
the delta, one button ("טען תשרי · 74 MB"), copy into `import/`, let the
app import on disconnect. No app on the phone: offer the APK from the
latest GitHub Release. Dumb-player mode: plain MP3 (`mp3-32`) into
`SichosKodesh/<year>/<month>/<date - occasion>/NN sicha.mp3`. Later: a
"sources" plugin so the same station serves other yeshiva content.

**The core is built** (`apps/station`, `sk-station`; its README has the
routine). The Windows shell is not: Tauri and MTP need a Windows machine to
build and test. Today a phone is reached as a folder, which covers USB
storage, a card reader, or a synced folder. Where the core differs from the
text above:

- **The mirror is built from the pack API, not from `index.json`.** Each
  configured scope (a year or a month) is fetched as the API's parts and
  checked with pack-builder's `verifyPack`. A pack is fetched again only
  after a new publish. The mirror's own `packs/index.json` is what a phone
  is planned against.
- **The plan counts space.** Each round takes the pack that brings the most
  new bytes and fits `device.json`'s free space, less a reserve. A pack
  costs its size plus the objects its import writes. Packs already waiting
  in `import/` count as held. The one-line summary is Hebrew ("טען תשרי
  תשל״ו · 83 MB").
- **There is no disconnect trigger.** The app imports when it next opens
  (WP4), so the station only copies. Each pack is copied under a
  `.partial` name and renamed once whole.
- **Player mode reads `src` too**, since the JEM originals are MP3 already.
  It writes numbered folders a player sorts right, with Hebrew chapter
  names.
- **The APK** comes from the latest release: `sk-station apk`, then
  `apk-to` copies it into a phone's `Download/`.

Verified: tests against pack-api's handler in process, and a run on the M1
archive. `sk-pack serve`, then `sync`, then `load` into a phone folder; each
copied pack passes `sk-pack verify`; `player` wrote the 17 recordings.
M4 (a phone loaded at a real station) waits for the Windows shell and a
real phone.

### WP7 - later

JEM-only events (723 h) as browsable items; Ashreinu transcripts and
playlists in the archive; the hub the vision page describes; the
station's sources plugin.

## 5. Order, parallelism, milestones

```
WP1 pack-format ──┐
WP2 archive ──────┼─► WP3 builder (M1) ─┬─► WP4 phone import + zips (M2) ─► WP6 station (M4)
WP2b indexers+v2 ─┘                     ├─► WP5 site (M3) ─► WP5b Rebbe Drive
                                        └─► WP4b library browsers (phone)
```

- Weeks 1-3: WP1 + WP2 (this PR) and the first crawl on the VPS; WP2b
  starts; the SAF/import spike on the emulator.
- Weeks 3-5: WP3, M1, listening test.
- Weeks 5-8: WP4 (M2). Weeks 6-10: WP4b, collection by collection.
- Week 6+: WP5. Weeks 9-13: WP6. WP5b after WP5.

One PR per work package on the usual branch, restarted from `main` each
time. The library extension (WP4b) is phone-only, so the "every change
ships in both apps" policy does not apply to it; anything that does touch
the web app carries a version bump and a changelog entry as usual, and
phone releases go through the "Android Signed Release APK" workflow.

## 6. Decisions

Answered by Shmuly:

1. **Archive host: a small VPS** (~100 GB disk). WP2 ships the Docker
   Compose and systemd setup so `sync`, the R2 mirror and the `restic`
   backup run unattended; the CLI itself is host-agnostic.
2. **First work package: WP1 + WP2 in one PR** with this document; WP3
   follows as the next PR.
3. **Key custody.** The production key was made with `sk-pack keygen`
   on 2026-09-24 (key id `aac79a9724647680`). Only its public half is
   committed; the secret stays off the repository, with whoever signs
   packs.
4. **The library extension is phone-only**; the web app keeps the
   farbrengens experience it has.
5. **The Rebbe Drive adds to the download site**, it does not replace it.

Still open:

6. **Device matrix**: two or three real kosher phones (model, Android
   version, storage, whether "All files access" is exposed, whether they
   are Play-certified). WP4 is not done until import and playback are
   verified on them. Not needed before WP4.
7. **Default profile** after the listening test (24 kbps is the
   recommendation; nothing blocks on it because the first packs are `src`).
8. **Igros / Maanos text rights**: the source is a commercial app's data
   file. Shmuly confirms permission from its publisher (or that the text
   is free to redistribute) before `packages/igros-index` output goes into
   a catalog release or a pack. **Decided for the Igros (2026-09-24):**
   Shmuly cleared the Igros Kodesh; they ship as a readable sefer (WP17 in
   docs/chabad-library-plan.md). The Maanos stay local until they are
   cleared too.
9. **Likkutei Sichos text**: facts, flags and links only until it is
   settled which text on mafteiach is its own editorial writing.
10. **Permission from JEM**: redistributing JEM and mafteiach content as
    packs is a different act from proxying a stream. The archive's
    provenance index documents exactly what came from where; a
    conversation with JEM before packs go public is recommended.

## 7. Risks

- **Android developer verification (reported for September 2026)**: on
  Play-certified devices an unverified sideloaded APK may require a
  developer-mode flow with a one-day wait. Not verified here; settle it
  with the device matrix, and if it applies, register the package as a
  verified developer.
- **Storage on 16-32 GB phones**: the store must show its size and let the
  user drop packs by month (extend the existing Offline management page);
  import refuses when free space is below pack size plus a margin.
- **Upstream fragility** (Drive 502s, JEM URL changes): the archive exists
  so downstream never depends on upstream again; until it lands the
  streaming path keeps its current behaviour.
- **Crawl load on mafteiach**: the full crawl of every section is one
  pass with the same politeness as today's crawler (cached pages, one
  request at a time); the archive never hits mafteiach at all, only the
  files its links point at.
- **Rights**: the Maanos and Likkutei Sichos text stay locked (section
  6) - the Drive's per-collection policy exists for this. The Igros are
  cleared (decision 8).
- **`node:sqlite` is marked experimental** in Node 22; it is the same
  SQLite behind a stable-enough API, and the archive isolates it in
  `src/db.ts` so a swap to `better-sqlite3` is one file.
- **MTP on Windows** is slow and flaky: the station resumes and verifies;
  hash-verified import makes partial copies harmless.
- **Old Android without Opus**: keep `src` and `mp3-32` profiles as the
  fallback.
- **Scope creep in the app**: WP4 sits behind the existing resolver and
  download records; if a change touches a screen other than Settings >
  Offline and About, it is probably wrong. WP4b is the place for new
  screens, and it lands collection by collection.
