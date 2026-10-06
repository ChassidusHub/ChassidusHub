# The ChassidusHub reader app

Sichos Kodesh becomes ChassidusHub's app for everyone: the same reader,
player and offline packs, under ChassidusHub's name, reading ChassidusHub's
API, with a way from every page to suggest a fix or report a problem on
the site. The steward asked for it on 6 October 2026: a full rebrand, a
new app id, the APK and its updates from our own server as now, and no
Play Store.

The code is `sichos-kodesh/` today (moved from shmuky/Sichos-Kodesh in
PR #12). Nothing here changes what the site or the editing side does.

## What changes, and what stays

| | Sichos Kodesh (today) | ChassidusHub app |
| --- | --- | --- |
| Name on the phone | Sichos Kodesh | ChassidusHub |
| Android app id | `com.sichoskodeshmobile` | `org.chassidushub.app` |
| Version | 2.0.0 (code 15) | 3.0.0 (code 16) |
| Icon | Sichos Kodesh's | the ChassidusHub book mark (design/assets) |
| Folder | `sichos-kodesh/` | `reader/` |
| npm packages | `@sichos-kodesh/*` | `@chassidushub-reader/*` |
| Workflows, tags | `sk-*.yml`, `sk-v…`, `sk-catalog-v…` | `reader-*.yml`, `reader-v…`, `reader-catalog-v…` |
| Catalog | `api.sk.chassidushub.org` (its own Worker) | `api.chassidushub.org/v1/app` (ChassidusHub's API) |
| Texts | the same, passed on | `api.chassidushub.org/v1/app/v3/texts/…` |
| App updates | `api.sk…/v1/app/android/…` | `api.chassidushub.org/v1/app/android/…` |
| Packs and APK files | `packs.chassidushub.org` | `packs.chassidushub.org` |
| Recordings | `media.chassidushub.org` | `media.chassidushub.org` |
| Web app, download page | `app.chassidushub.org`, `/get` | the same |
| Fix or report | nothing | links to chassidushub.org on every page |

Stays as it is: the content ids (the `sichosKodesh` edition, the
`sichos-kodesh` work and the `sichos-kodesh-*` external ids are the
names of a source, not of the app), the pack format and its signing key,
the APK signing key (Android lets one key sign a new app id, so the CI
secrets stay), and how an update is found and installed.

Because the app id is new, Android treats it as a new app: it installs
beside Sichos Kodesh and starts with empty settings. That also means
every storage name, notification channel and native module name can be
renamed freely, with no one's data to carry over. The web app at
app.chassidushub.org has no users yet either (it was on Vercel until
now), so its storage keys rename freely too.

## Step 1: the rename (one PR, web part live at once)

- Move `sichos-kodesh/` to `reader/` and rename the packages; the
  workflows and their tags, the OIDC policy of the app server (audience
  `chassidushub-reader-release`, workflow `reader-android-release-apk.yml`,
  tags `reader-v…`) and CLAUDE.md follow.
- Android: app id and namespace, the Kotlin package
  (`org.chassidushub.app`), `app_name`, the React Native app name, the
  deep-link scheme (`chassidushub://`), the native modules
  (`ChassidusHubAppInfo`, …), notification channels, WorkManager names,
  the headless task, the launcher and notification icons, the shared
  folder (`Documents/ChassidusHub`, and the station that reads it). The
  About screen loses its Play Store links.
- Words: every "Sichos Kodesh" / "שיחות קודש" that names the app, in
  both languages, the web app's title and install name, the player's
  album name, the download page, release titles and APK file names
  (`chassidushub-3.0.0-arm64-v8a.apk`), user agents. Where the words
  name the hanachos edition, they stay.
- Look: the ChassidusHub palette and logo where the app shows its name
  (header, About, splash, icon). A full redesign to the site's screens
  (design/) is its own later step, screen by screen, as the site did.

## Step 2: one API

- The app's base address becomes `https://api.chassidushub.org/v1/app`
  (app-core's `CATALOG_API_BASE_URL`). ChassidusHub already answers the
  catalog and the texts there in the app's shapes (`appCatalog.ts`,
  docs/sichos-kodesh.md section 6).
- App updates: the API passes `/v1/app/android/latest.json` and
  `/download/<abi>` on to the packs Worker over a service binding,
  instead of the 307 to api.sk it gives today.
- The library: ChassidusHub does not hold it yet, so today its releases
  are numbered `0.x` and no phone takes them. Until it does, the API
  passes the app's catalog requests on to the reader's own catalog Worker
  (`chassidushub-reader-catalog`, no address of its own, a service
  binding), so phones keep the catalog they always had. Once ChassidusHub's
  release is whole it serves its own, numbered `2.x`, and phones switch
  on their own. Importing the library is its own step after this one.
- Before the app ships on this address, a check compares ChassidusHub's
  release with the catalog the app bundles: every farbrengen, recording,
  sefer and unit the app shows today must be there. Whatever is missing
  is imported first.
- The Workers keep their names where data already points at them: the
  media proxy's workers.dev address is in ChassidusHub's links, so it
  stays `sichos-kodesh-media-proxy` (now also at media.chassidushub.org),
  and the packs Worker stays `sichos-kodesh-pack-api` (at
  packs.chassidushub.org). Only addresses people see change.

## Step 3: suggest a fix, report a problem

- On a farbrengen, a sefer and a sefer's page, the ⋯ menu gets
  "Suggest a fix" and "Report a problem". In Settings and About:
  "Report a problem with the app".
- They open chassidushub.org in the browser. The app knows only its own
  ids, so the site gets one small route, `/_/app/<kind>/<id>/<edit|report>`,
  that finds the item by its external id (`mafteiach` for a farbrengen,
  `sichos-kodesh-work`, `sichos-kodesh-unit`) and redirects to
  `/edit/<id>` or `/issues/new?about=<id>`; the app's version and
  platform go along. When the item is not found it opens a new issue
  naming what the app showed, so no report is lost.
- Signing in, the suggestion and its review are the site's as they are.

## Step 4: go live

1. Deploy the Workers in the chassidushub.org account: packs (needs the
   `PACK_SIGNING_KEY` secret), media, the site (`app.chassidushub.org`
   and `/get`), and the API with its new routes.
2. Tag `reader-v3.0.0`: CI builds the three signed APKs and publishes
   them to the packs Worker; `/get` offers them.
3. Check on a phone: install, catalog update, a text, a recording, a
   pack, the update check, and both links.

## Step 5: moving Sichos Kodesh users over

Phones with Sichos Kodesh ask the old server (`api.sk.shmuky.dev`) for
updates. Its `latest.json` is changed to offer ChassidusHub 3.0.0, with
notes saying "Sichos Kodesh is now ChassidusHub: install it, then remove
this app". The update prompt they already have then installs the new
app beside the old one, so no last Sichos Kodesh build is needed. This
is a change on the old account, made only on the steward's word.

The old hosts (`api.sk.shmuky.dev`, the shmuky Workers, Vercel) stay up
until those phones have moved, then are turned off with the rest of the
old account.

## Needs from the steward

- The name, on the card in the thread (ChassidusHub by default).
- For step 4: a Cloudflare token for the chassidushub.org account that
  can deploy Workers (or he deploys), and `PACK_SIGNING_KEY`.
- For step 5: his word to change the old server's `latest.json`.
