# Changelog

What changed, for the people who use ChassidusHub and the programs that read
it. The catalog itself changes every day and is not listed here: its
history is on every page, in `/v1/commits` and in the git mirror.

The API follows [semantic versioning](https://semver.org): nothing under
`/v1` is removed or changes meaning; new routes and fields may be added at
any time. `@chassidushub/client` carries the API's version.

## Unreleased

- The site is English first: a bare address is English and `?lang=he` is
  Hebrew (`?lang=en` still works). Links in emails and the OAuth consent page
  (`ui_locales=he`) follow; a new account's emails default to English.
- The reader app (formerly Sichos Kodesh, now the ChassidusHub app in
  `reader/`) reads `/v1/app`. New: `GET /v1/app/item` finds the item an
  app's "Suggest a fix" or "Report a problem" is about, by the app's own ids
  (`farbrengen`, or `work` and `unit`); the site sends those links on from
  `/_/app/edit` and `/_/app/report`. The app's update routes
  (`/v1/app/v1/app/android/…`) now redirect to `packs.chassidushub.org`.
  While ChassidusHub's app release lacks the library, `/v1/app/v<n>/catalog/…`
  answers with the reader's own catalog, its addresses under `/v1/app`.
- The logo's book carries a C.
