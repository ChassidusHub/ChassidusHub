# @chassidushub-reader/pack-builder

`sk-pack`: builds the signed `.skpack` files a phone imports offline, from
the archive `sk-archive` keeps. It verifies them the way a phone would, and
writes the `index.json` the download site and the yeshiva station read. The
pack format is `packages/pack-format`; the plan is `docs/offline-plan.md`
(WP3).

A build is a concatenation, not an encode. The selection (catalog entries,
content types and an audio profile) is sized against the archive's objects
with pack-format's `sizeSelection`, the same function the download site
and the phone use. The objects already in the archive are then written,
unchanged, into a stored ZIP with a signed manifest as the first entry.
Tishrei 5736 (82 MB) builds in about a second.

## Commands

Every command takes the archive root, like `sk-archive` (`--root`, or
`SK_ARCHIVE_ROOT`).

```
sk-pack keygen [--out file] [--force] [--dev]
sk-pack transcode [--profile opus16] [--collection farbrengens] [--scope 5736-01] [--limit N] [--concurrency N] [--ffmpeg path]
sk-pack build --scope 5736-01 [--profile opus16|src] [--sections essentials] [--max-mb 200] [--out dir]
              [--catalog-dir dir] [--catalog-version v] [--catalog-release file]
              [--key file | --unsigned] [--no-objects-index] [--allow-missing]
sk-pack build-work --work tanya [more ids | all] [--works-dir dir] [--max-mb 200] [--out dir]
                   [--key file | --unsigned] [--allow-missing]
sk-pack verify <packs...> [--key file] [--trust keyId=publicKey ...]
sk-pack index [--dir dir] [--out file]
sk-pack publish [--out dir] [--catalog-dir dir] [--catalog-version v] [--packs dir]
sk-pack mirror [--dir dir] [--bucket sichos-kodesh-archive] [--concurrency 4] [--prune]
sk-pack serve [--dir dir] [--port 8787] [--host 127.0.0.1] [--key file | --unsigned]
```

From the repository: `npm run pack -w @chassidushub-reader/pack-builder -- <command>`.

- **keygen** writes the signing key to `<root>/keys/pack-signing.json`
  (mode 0600) and prints its public half. Keep an offline copy of the file
  and never commit it. Add the printed line to `TRUSTED_PACK_KEYS` in
  `packages/pack-format/src/signing.ts`, and every app built after that
  trusts packs signed with it. A second keygen refuses to overwrite the key,
  since that would orphan every pack already signed. `--dev` writes the
  published development key instead: debug builds of the app trust it,
  release builds never do. It is for testing an import before the real key
  exists.
- **transcode** encodes the original recordings into a smaller profile,
  once each. It uses ffmpeg with libopus (`-ac 1 -c:a libopus -b:a 24k -vbr
  on -application audio -frame_duration 60`), or libmp3lame for `mp3-32`.
  The bytes go under `derived/<profile>/` and each pair is recorded in the
  archive's `derivations` table. A track whose chapter name says it is a
  nigun is encoded one profile up (opus24 at 32k) but filed under the
  profile asked for, so a pack's profile stays uniform. The encode is
  bit-exact (`-fflags +bitexact`: no random Ogg serial, no encoder tag), so
  the same original always gives the same hash. A second run skips what is
  done.
- **build** writes `<slug>-<profile>.skpack`, e.g.
  `5736-01-tishrei-src.skpack`. The options:
  - `--scope` is a Hebrew year or a year and mafteiach month token.
  - `--sections` takes the app's own content types: `essentials`,
    `everything`, or a list of `audio`, `biltiMugah` (or
    `biltiMugah:sichosKodesh+torasMenachem`), `mugah`, `maamorim`,
    `hagahos`, `hosofos`.
  - `--max-mb` splits a scope into `…part1of3.skpack` and so on. A part
    only ever holds whole occasions, because a manifest may only refer to
    objects in its own part. An occasion larger than the limit gets a part
    of its own. Each part is a valid pack, with `manifest.part` naming its
    set.

  If some of the selection is not in the archive yet, the build stops and
  names what is missing. `--allow-missing` builds without it. The pack
  carries `objects.json` (the trust anchor for loose files) unless told
  not to, and a catalog release when given one.
- **verify** checks what a phone checks, and more:
  - every entry is stored, and `manifest.json` comes first;
  - the manifest parses and its signature verifies against a trusted key
    (`TRUSTED_PACK_KEYS`, the local key file, `--trust`);
  - the object entries are exactly the manifest's objects;
  - every object's bytes hash to its name and match the ZIP's CRC-32;
  - `objects.json` and `catalog.json` match the manifest's stamps.
- **index** writes `index.json` next to the packs, one line per pack: id,
  file, size, sha256, catalog version, profile, scope, object list, part.
  Its shape is `PackIndexFile` in pack-format, and the station's
  `choosePacks` reads it.
- **publish** writes the archive the way the pack API
  (`services/pack-api`) reads it, into `<root>/published` by default:
  - `meta.json`;
  - per year: the catalog, `catalog/<year>.json`, and an index shard,
    `index/<year>.json`, holding each object's size and CRC-32 for that
    year's selections;
  - `objects.json`;
  - `objects/<sha256>`, hard-linked from the archive, so they take no
    extra disk;
  - `packs/` with its `index.json`, when there are prebuilt packs.
  - the seforim, from the text packs among the prebuilt ones
    (`build-work`): `works/shelf.json` (bundled by author, the small
    ones together), `works/<id>.json` (each sefer's entries) and
    `index/works.json`, so the API can add them to any pack.

  CRCs are cached in `.crc-cache.json`, so a second publish reads only
  new objects. Then `rclone sync <root>/published r2:<bucket>` uploads it,
  or `sk-pack mirror` does.
- **mirror** uploads a published directory to the R2 bucket through
  Cloudflare's API, with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
  (a token with R2 edit rights) in the environment. No rclone is needed.
  - An object the bucket already holds at the same size is skipped.
  - Any other file is sent when its MD5 differs from the bucket's ETag.
  - Objects go first and `meta.json` last, so the Worker never names an
    object the bucket lacks.

  `--prune` then drops each mirrored object from this disk: both the
  published copy and the archive's own bytes. It lists them in
  `.mirrored.json`, and the next publish keeps them in the index using
  their cached CRC-32. This lets a small disk publish the whole archive a
  year at a time:

  ```sh
  sk-archive crawl --collection farbrengens --scope 5737
  sk-pack transcode --profile opus16 --collection farbrengens --scope 5737
  sk-pack transcode --profile opus24 --collection farbrengens --scope 5737
  sk-pack publish --out <dir> && sk-pack mirror --dir <dir> --prune
  ```

  After a prune, the archive's `stats` counts those objects as off disk.
  The bucket is where they live.
- **build-work** builds a sefer's text pack (catalog schema 3,
  `work-<id>.skpack`):
  - its texts that may ship, read from the archive by the sha256 the
    catalog's units name (`apps/mobile/src/catalog/data/works`);
  - its search index, built from those same texts (packages/pack-format's
    "Text packs" has the layout).

  The same texts make the same pack. `all` builds every work that has text
  that may ship. First store the texts with `sk-archive import-text
  --collection works --dir packages/sefaria-index/data`. The first build
  (2026-09-24, catalog 1.3.0):

  | Work | Texts | Search index | Pack |
  | --- | --- | --- | --- |
  | Tanya | 258 (2.8 MB) | 1.4 MB | 4.4 MB |
  | Torah Or | 306 (3.7 MB) | 2.6 MB | 6.5 MB |
  | Likkutei Torah | 618 (9.2 MB) | 6.2 MB | 15.7 MB |
  | Shulchan Aruch HaRav | 1,245 (17.9 MB) | 8.4 MB | 27.0 MB |
  | Shaar HaYichud (English) | 55 (0.8 MB) | 0.3 MB | 1.1 MB |
  | Derech Mitzvosecha | 134 (2.0 MB) | 1.5 MB | 3.6 MB |
  | Weekday Siddur (English) | 6 (12 KB) | 48 KB | 64 KB |
  | Ma'aneh Lashon | 7 (0.1 MB) | 0.1 MB | 0.2 MB |

- **serve** runs the pack API's handler on a published directory: local
  development of the download site (`apps/download`), or a server with no
  cloud at all. Custom packs are signed with the archive's key.
  `--unsigned` serves them unsigned, and the phone then takes them as
  loose files.

## The ZIP

Every entry is stored (method 0), and its CRC-32 and sizes are in the local
header. There are no data descriptors and no extra fields, and timestamps
are fixed at 1980-01-01. Android's `ZipInputStream` streams that without
seeking: it refuses a stored entry that defers its sizes to a data
descriptor. `unzip -l` lists it and any file manager opens it. There is no
ZIP64, so a pack stays under 4 GiB, and `--max-mb` splits long before that.

## Milestone M1 (2026-09-24)

The Tishrei 5736 recordings and hanachos were crawled into a scratch
archive (`sk-archive crawl --collection farbrengens --scope 5736-01`: 44
files, 94.4 MB), then built with
`build --scope 5736-01 --profile src --sections audio,biltiMugah:sichosKodesh,mugah`:

| Check | Result |
| --- | --- |
| The pack | `5736-01-tishrei-src.skpack`: 11 occasions, 33 objects, 82.4 MB |
| `sk-pack verify` | ok, signed |
| `unzip -v` | all 35 entries `Stored`; `unzip -t`: no errors |
| `sha256sum` of the extracted objects | all 33 equal their names and the manifest's sizes |
| `--max-mb 30` | 4 parts, each verifies; `index.json` lists them with one `setId` |
| `transcode --profile opus24` | 17 recordings, 79.2 MB to 58.5 MB, in about 6 minutes on 4 cores; the opus24 pack is 61.7 MB and verifies |

The JEM originals are already small: the Tishrei sichos are 32 kbps mono
MP3 at 22 kHz, and some nigun tracks are 64 kbps. So opus24 saves about a
quarter on speech, and opus16 saves about half. In the listening test,
Shmuly heard no difference between the profiles. That makes `opus16` the
candidate default once Opus plays on real phones
(`docs/offline-plan.md`, WP3).

## Scripts

```
npm run build -w @chassidushub-reader/pack-builder
npm test -w @chassidushub-reader/pack-builder        # fake encoder; no ffmpeg needed
npm run typecheck -w @chassidushub-reader/pack-builder
```
