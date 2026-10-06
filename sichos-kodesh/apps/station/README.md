# @sichos-kodesh/station

The yeshiva station (`docs/offline-plan.md`, WP6). It runs on the office PC:

- **Overnight**, it keeps a mirror of signed packs from the pack API.
- **During the day**, it loads plugged-in phones from that mirror, with no
  internet.

This package is the core and a command line, `sk-station`. The Windows
shell the plan describes (Tauri, MTP through the Windows Portable Devices
API) wraps the same functions. Today, a phone is reached as a folder.

## The routine

```
sk-station init --api https://<pack-api> --scope 5736 --scope 5737-01 --sections essentials
sk-station sync                 # overnight: fetch, verify, index
sk-station status <phone>       # what loading this phone would copy
sk-station load <phone>         # copy it
sk-station player <folder>      # plain MP3 folders for a player with no app
sk-station apk                  # the newest release's phone APKs (from the app server), for phones without the app
sk-station apk-to <storage>     # one of them into the phone's Download/
```

Every command takes the mirror root: `--root`, or `SK_STATION_ROOT`, and
`./station` by default. From the repository:

```
npm run station -w @sichos-kodesh/station -- <command>
```

- **init** writes `station.json`:
  - the pack API;
  - the scopes (a Hebrew year, or a year and a mafteiach month token);
  - the sections and profile, which read exactly as in `sk-pack build`;
  - the largest pack file (`--max-mb`, 200 by default);
  - extra trusted keys (`--trust keyId=publicKey`);
  - the space to leave free on a phone (`--reserve-mb`, 500 by default).

  `--accept-unsigned` keeps packs whose signature does not verify. It is only
  for an API run with `sk-pack serve --unsigned`; the phone then takes such a
  pack as loose files.
- **sync** asks the API for each scope's size and parts, then streams each
  part into `packs/` and checks it the way a phone does, with pack-builder's
  `verifyPack`: every hash, every CRC, and the signature. It then indexes the
  mirror (`packs/index.json`) and saves the scopes' catalog years.
  - A pack is fetched again only after a new publish (the API dates each
    build to its publish time) or when its file is gone.
  - A scope taken out of the config drops its packs.
  - A failed fetch keeps the earlier copy, if there is one.
- **status** and **load** read the phone's `state/have.json` (every object
  it holds) and `state/device.json` (model, free space). The app writes both
  after each import.
  - Each round picks the mirror pack that brings the most new bytes, while it
    fits. A pack costs its own size plus the objects its import writes; the
    app deletes the pack only after importing it.
  - Packs already waiting in `import/` count as held.
  - Each pack is written under a `.partial` name and renamed once whole, so
    the app never sees half a pack.
  - `<phone>` is the app's shared folder, or a storage root that holds
    `Documents/SichosKodesh`.
- **player** writes the recordings of the mirror's MP3 packs (`src`,
  `mp3-32`) for a player with no app:

  ```
  SichosKodesh/5736 תשל״ו/01 תשרי/13 י״ג - מוצאי י״ג תשרי/02 שיחה א׳.mp3
  ```

  - The numbers lead because a player sorts by name, and Hebrew numerals do
    not sort (ט״ו before י״ג).
  - Chapter names are the catalog's Hebrew ones. For an archive published
    before those existed, the same rules come from
    `@sichos-kodesh/catalog/translate`.
  - A second run writes only what is new.
  - `--scope` narrows it to years or months.
- **apk** keeps the newest release's `arm64-v8a` and `armeabi-v7a` APKs in
  `apk/`, from the app server (`api.sk.chassidushub.org/v1/app/android/`), each
  checked against its sha256. **apk-to** copies one into a phone's `Download/`, where its
  file manager installs it.

## Checked

`npm test -w @sichos-kodesh/station` runs pack-api's real handler in
process, over a published archive of four Tishrei 5736 farbrengens. It
covers:

- sync, keep, re-fetch after a new publish, and dropping a removed scope;
- refusing and accepting unsigned packs;
- the phone plan: new objects, up to date, no room, the reserve, pending
  packs, and a phone that has not written its state yet;
- load, with the copied pack's hash checked;
- player mode, and a second run writing nothing;
- the APK mirror.

End to end, on the M1 archive:

1. `sk-pack serve` on the M1 archive.
2. `sk-station sync` fetched Tishrei 5736 as four 40 MB parts (83 MB) and
   verified each; a second sync fetched nothing.
3. `sk-station load` on a phone folder copied all four into `import/`, and
   `sk-pack verify` passes on each copy.
4. `sk-station player` wrote the 17 recordings as MP3s in Hebrew folders.

Not yet: the Windows shell and MTP (the plan's Tauri app), and a run
against a real phone.

## Scripts

```
npm test -w @sichos-kodesh/station
npm run typecheck -w @sichos-kodesh/station
npm run build -w @sichos-kodesh/station      # dist/bin/sk-station.js
```
