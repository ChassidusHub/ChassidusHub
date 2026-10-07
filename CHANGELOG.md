# Changelog

What changed, for the people who use ChassidusHub and the programs that read
it. The catalog itself changes every day and is not listed here: its
history is on every page, in `/v1/commits` and in the git mirror.

The API follows [semantic versioning](https://semver.org): nothing under
`/v1` is removed or changes meaning; new routes and fields may be added at
any time. `@chassidushub/client` carries the API's version.

## Unreleased

- The library's Edit is Organize: Read · Edit on the library and on each
  shelf, `/sets?edit` opens Organize on the shelf, and a shelf's page in
  Edit changes its names and few words in place.
- Sefer and volume pages have Read and Edit: a sefer's names and its few
  words, and each sicha's name in a volume, are changed in place into
  your draft. A volume lists its sichos by name under their parshiyos,
  where it listed a sicha's numbered pieces.
- Text pages (a sicha, a letter, a chapter) have Read and Edit at the
  same address. In Edit each paragraph can be fixed, taken out, marked
  right or followed by a new one; the changes collect in your draft, shown
  in blue, and Send makes them one Suggestion.
- Drafts (docs/api.md, "Your changes, not sent yet"): `/v1/drafts` keeps
  the changes a person made on a page in Edit until they send them, and
  `POST /v1/drafts/<page id>/send` makes them one Suggestion, each change
  checked against what the person saw. Migration 29.
- The redesign begins (docs/plans/redesign.md): calmer colours across the
  site (whiter paper, green for approved, blue for your changes not sent
  yet), and the page frame every page will share, with Read and Edit at the
  same address (`?edit`). The closed phone menu no longer makes pages wider
  than the phone.
- Transcripts made on GPU pods come into the catalog with
  `chassidushub transcripts-import` (docs/transcription.md): a transcript
  paragraph may carry `quotes` (the verses it quotes, with their Sefaria
  ref and page), a synced word `bold` (said with stress, drawn bold), and a
  transcript may have machine translations, synced paragraph by paragraph.
  Built-in schemas version 15.
- Machine transcripts come one sentence a line, cut where a sentence ends
  rather than at Whisper's 30-second pieces, and tidied into the house
  spelling (glued words after a ' set apart, abbreviation marks as ״).
- `GET /v1/machine/training/clips` gives only the Rebbe's own voice (no
  niggunim, guests, davening or translators), and now also paragraphs fixed
  in part and fixes waiting for review, each clip with `review`
  (`checked`, `edited`, `pending`); `?carried=1` adds fixed paragraphs cut by
  their carried word times (`timing: "carried"`). `GET /v1/machine/training`
  counts them by `review`.
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
