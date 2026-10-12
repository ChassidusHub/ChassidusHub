# The catalog snapshot

The whole catalog tree as a few JSON files that never change once written:
every shelf (Set) and sefer, each sefer's units by volume, and each Hebrew
year's farbrengens and other events. The new site draws its library, sefer,
volume and listening pages from it, in its Worker and in the browser, with no
read of the database for each page. It is the reader app's model (one
versioned catalog, loaded once, every move after that a lookup in memory),
cut in parts so a page fetches only what it shows. The plan is
`studio/plans/www-instant.md`, item A.

Code: `packages/core/src/catalogSnapshot.ts` (the types, building it from
main, writing it), `services/api/src/catalogSnapshot.ts` (the addresses, the
bucket, building it again).

## Addresses

| Path | What | Cache-Control |
| --- | --- | --- |
| `GET https://api.chassidushub.org/v1/catalog/manifest.json` | which files make up the snapshot now | `public, max-age=60, s-maxage=60` |
| `GET https://api.chassidushub.org/v1/catalog/index.json` | the same snapshot as the names of its files only (a few hundred bytes) | `public, max-age=60, s-maxage=60` |
| `GET https://api.chassidushub.org/v1/catalog/files/<file>` | one file, as the manifest names it | `public, max-age=31536000, immutable` |

A file's address is the manifest's `base` followed by its `file`. A file is
named by the start of its sha256 (`tree.3f9c0d1e2a4b5c6d.json`), so the same
name is never used for other bytes: keep it for good, in the browser, the
edge and a service worker. A file that did not change in a newer snapshot
keeps its name. Files are never removed, so a reader holding an older
manifest still finds every file it names.

The files are kept in the public bucket (`chassidushub-public`) under
`catalog/manifest.json`, `catalog/index.json` and `catalog/files/<file>`.
The new site serves the same at its own address: `/_/catalog/manifest.json`,
`/_/catalog/index.json` and `/_/catalog/<file>`. The site's Worker may
read them straight from the bucket, with no request to the API, if it binds
that bucket.

## When it is built

From main, never from anyone's words: units from `unit_place` (migration
0030), and of every other item only the fields listed below.

- After any write to the API that went through (an Approve, a live fix, an
  organize, by the site, a token or the MCP server), behind its answer.
- When a manifest is asked for and main has changed since the one kept: that
  answer still serves the kept one, and the build runs behind it.
- By the scheduled run, every minute.
Never while someone waits: a whole build on live runs longer than a request
may (30 s). With none built yet (an empty bucket), the manifest answers `503`
with `Retry-After: 30` and starts a build behind the answer; a reader falls
back to the API until it answers. Each build logs how long it took.

Each check costs one statement when nothing changed. One build runs at a time
in a Worker; a burst of Approves is one build, then one more to catch the
last. A manifest never goes back to an older catalog.

## manifest.json

```jsonc
{
  "format": 1,                 // bumped only for a change an older reader would misread
  "version": "48213",          // the last commit that changed a shelf, sefer, unit, event or recording
  "seq": 48213,                // the same, as a number: newer is larger
  "changedAt": "2026-10-12T01:58:03.000Z",
  "builtAt": "2026-10-12T02:00:11.412Z",
  "base": "https://api.chassidushub.org/v1/catalog/files/",
  "tree": { "file": "tree.3f9c0d1e2a4b5c6d.json", "bytes": 512301, "sha256": "3f9c…" },
  "names": { "file": "names.7e6d5c4b3a291807.json", "bytes": 6120400, "sha256": "7e6d…", "rows": 81200 },
  "works": {                   // each sefer that has units, by id
    "rh-1a2b3c": { "file": "work-rh-1a2b3c.0d1e2f3a4b5c6d7e.json", "bytes": 81233, "sha256": "0d1e…", "units": 1530 }
  },
  "years": {                   // each Hebrew year that has events
    "5742": { "file": "year-5742.9a8b7c6d5e4f3a2b.json", "bytes": 40122, "sha256": "9a8b…", "events": 212 }
  },
  "counts": { "sets": 480, "works": 2210, "units": 69012, "events": 9120 }
}
```

## tree.json

Every shelf and every sefer. Each list is in the catalog's order: by the
item's own key in that shelf (`orderIn`), else its `order`, then its path.

```jsonc
{
  "format": 1,
  "top": ["rh-…"],             // the top shelves: the Rebbeim in their line, then the others
  "sets": {
    "rh-…": {
      "id": "rh-…", "path": "/sets/the-rebbe",
      "rev": 1234,             // its revision on main, for an edit form
      "name": { "he": "הרבי", "en": "The Rebbe" },
      "slug": "the-rebbe",
      "parent": "rh-…",        // absent on a top shelf
      "rebbe": 9,              // 1-9 on the Rebbeim's own shelves, in their line
      "sets": ["rh-…"],        // the shelves inside it
      "works": ["rh-…"],       // its official sefarim
      "additions": ["rh-…"]    // additions on it that belong to no official sefer on it
    }
  },
  "works": {
    "rh-…": {
      "id": "rh-…", "path": "/likkutei-sichos",
      "rev": 5678,
      "title": { "he": "ליקוטי שיחות" },
      "slug": "likkutei-sichos",
      "sets": ["rh-…"],        // the shelves it is on
      "addition": { "kind": "index", "to": "rh-…" },   // only on an addition; `to` when it belongs to a sefer
      "additions": ["rh-…"],   // the additions to it
      "parts": [{ "value": "12", "label": { "he": "חלק יב" }, "units": 48 }],  // its volumes, from its units
      "units": 1530,
      "level": "volume",       // what its first level is called, from its first unit (absent with no units)
      "depth": 3               // how many levels its units' positions have: 1 means /sefer/3 is a unit, not a volume
    }
  }
}
```

A name is `{ "he": … }`, with `"en"` where the item has an English name that
differs. Markup left in names by imports is dropped.

## work-&lt;id&gt;.json

One sefer's units, by volume, in the sefer's order.

```jsonc
{
  "format": 1,
  "work": "rh-…",
  "level": "volume",
  "depth": 3,
  "parts": [
    {
      "value": "12", "label": { "he": "חלק יב" }, "units": 48,
      "items": [
        {
          "id": "rh-…", "path": "/likkutei-sichos/12/3",
          "title": { "he": "בראשית א", "en": "Bereishis 1" },
          "place": "עמ׳ 49",   // the last of its position's labels, when it has more than one level
          "group": "בראשית"    // the level between the volume and the unit, when there is one
        }
      ]
    }
  ]
}
```

## year-&lt;yyyy&gt;.json

One Hebrew year's events, in date order and their order that day. Letters
are left to their sefer (Igros Kodesh), and an event with no year is left out.
Events with no recording are kept (a hanacha alone is worth listing); the
listening pages show those with `recordings` above 0. Whether a recording's
words can be followed is not here: it changes with every checked transcript,
and `/v1/transcripts` keeps that list.

```jsonc
{
  "format": 1,
  "year": 5742,
  "events": [
    {
      "id": "rh-…", "path": "/events/5742-05-10",
      "kind": "farbrengen",
      "date": "5742-05-10",    // or "5742-05" / "5742" when not known to the day
      "title": { "he": "יו״ד שבט תשמ״ב", "en": "Yud Shvat 5742" },   // null when it has none
      "order": 1,              // only when set
      "recordings": 3,
      "links": ["mugah", "bilti-mugah"]   // the kinds of its documents
    }
  ]
}
```

## names.json

Every name above as one flat list, for finding a name as the person types,
in the browser, with no server (the reader app's search does the same). One
row per shelf, sefer, volume (where units sit inside volumes), unit and
event:

```jsonc
{
  "format": 1,
  "names": [
    // [kind, title, titleEn, parent, path, date?]
    ["shelf", "שיחות", null, "הרבי", "/sets/sichos"],
    ["sefer", "ליקוטי שיחות", null, "שיחות", "/likkutei-sichos"],
    ["volume", "חלק יב", null, "ליקוטי שיחות", "/likkutei-sichos/12"],
    ["sicha", "בראשית א", "Bereishis 1", "ליקוטי שיחות חלק יב", "/likkutei-sichos/12/3"],
    ["farbrengen", "יו״ד שבט תשמ״ב", "Yud Shvat 5742", null, "/events/5742-05-10", "י׳ שבט תשמ״ב"]
  ]
}
```

A unit's kind is its own level (`sicha`, `maamar`, `letter`, `chapter`,
`siman`…); `parent` is what it is in, so a search may spend words on the
sefer's name; `date` is an event's Hebrew date in words.

## The small cut: index.json, top, shelves, years

On a slow phone the first tap comes before the manifest (about 29 kB
compressed) and the tree (about 64 kB) have arrived (#265). The same
snapshot is also cut smaller: an index that names files and nothing else, a
top file of a few kB, and one file per top shelf, asked for when that shelf
is opened. The work, year and names files are the same files the manifest
names. Both ways stay; a reader may use either.

```jsonc
// index.json: about 600 bytes compressed on live (30 top shelves)
{
  "format": 2,
  "version": "48213",                        // the same as the manifest's
  "top": "top.1a2b3c4d5e6f7a8b.json",
  "shelves": {                               // one per top shelf, by id, in the top's order
    "rh-…": "shelf-rh-….9c8d7e6f5a4b3c2d.json"
  },
  "years": "years.0f1e2d3c4b5a6978.json",
  "names": "names.7e6d5c4b3a291807.json"     // the manifest's names file
}
```

A file's address is the same folder as the manifest's files: the API's
`/v1/catalog/files/<name>`, the site's `/_/catalog/<name>`.

```jsonc
// top.<hash>.json: about 4 kB compressed on live
{
  "format": 2,
  "top": [                                   // the Rebbeim in their line, then the other top shelves
    {
      "id": "rh-…", "path": "/sets/the-rebbe", "name": { "he": "הרבי", "en": "The Rebbe" },
      "rebbe": 9,                            // a Rebbe's shelf only, and with it what is on it:
      "sets":      [{ "id": "rh-…", "path": "/sets/…", "name": { "he": "…" } }],
      "works":     [{ "id": "rh-…", "path": "/likkutei-sichos", "name": { "he": "ליקוטי שיחות" } }],
      "additions": [{ "id": "rh-…", "path": "/…", "name": { "he": "…" } }]
    },
    { "id": "rh-…", "path": "/sets/chitas-rambam", "name": { "he": "…" } }   // another top shelf: name and path
  ]
}
```

Everything here is in the order the tree gives (`sets`, `works`,
`additions` of tree.json). A sefer's `name` is its `title` in the tree.

```jsonc
// shelf-<id>.<hash>.json: one top shelf and everything under it, 1-11 kB compressed on live
{
  "format": 2,
  "shelf": "rh-…",
  "sets":  { "rh-…": { /* as in tree.json */ } },   // the top shelf and every shelf under it
  "works": {                                         // their sefarim and additions, and the additions to those sefarim wherever they sit
    "rh-…": { /* as in tree.json */, "file": "work-rh-….0d1e2f3a4b5c6d7e.json" }   // `file` when it has units
  }
}
```

A sefer on two top shelves is in both files. An addition on this shelf to a
sefer elsewhere brings that sefer along, so its link can be drawn.

```jsonc
// years.<hash>.json
{ "format": 2, "years": { "5742": { "file": "year-5742.9a8b7c6d5e4f3a2b.json", "events": 212 } } }
```

A file named here changes only when what it holds changes: a new event
changes the years file, not the top or a shelf; a new unit changes its
shelf's file (its sefer's work file has a new name), not the top.

## Changing the format

Add a field freely: readers ignore what they do not know. Removing or
changing the meaning of one bumps `format` (`SNAPSHOT_FORMAT`), and a reader
that finds a format it does not know falls back to the API. The index and
the files only it names (top, shelf, years) are format 2 (`SNAPSHOT_INDEX_FORMAT`);
the work, year and names files they share with the manifest stay format 1.
