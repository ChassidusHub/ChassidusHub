# Changelog

What changed, for the people who use ChassidusHub and the programs that read
it. The catalog itself changes every day and is not listed here: its
history is on every page, in `/v1/commits` and in the git mirror.

The API follows [semantic versioning](https://semver.org): nothing under
`/v1` is removed or changes meaning; new routes and fields may be added at
any time. `@chassidushub/client` carries the API's version.

## Unreleased

- A signed-out reader's page no longer asks for an account's draft it would be
  refused (a 401 that smoke counted as a broken page).
- A maamar's name no longer carries what the print adds to its dateline:
  the Chabad Library importer leaves out the opening `בס"ד` and the footnote
  `*` (`בס"ד, יו"ד שבט, תשי"ב*` is named `יו"ד שבט, תשי"ב`). It takes effect
  at the next import.
- The home page no longer waits half a minute after a quiet spell:
  `/v1/transcripts` answers from a list the API's scheduled run keeps
  (made again every fifteen minutes) instead of counting every
  transcript's paragraphs on the request. The list can be up to about
  twenty minutes behind.
- A sample catalog for local work: `npm run sample` loads a small made-up
  catalog into the local database (the Rebbeim's shelves, sefarim and
  additions, a sefer's words, a farbrengen with a recording and transcript,
  open suggestions), and with `DEV_ACCOUNT` the site now shows you signed in
  (`/v1/auth/me` answers for that account). See docs/local-sample.md.
- One record per volume: `chassidushub merge-printings` merges the printings
  of a sefer that are the same volume (HebrewBooks, אוצרות הרבי, a text) into
  one, with all their scans and sources, a Suggestion per sefer.
- Built-in schemas, version 16: a page segment's `printed` takes up to 1,000
  places (it was 50), so long notes read by machine are accepted. A schema
  upgrade that a start left unmerged is withdrawn on the next start, and an
  upgrade finds a schema item by its path too. Merge all on `/review` counts
  a suggestion merged in the meantime as merged.
- Merging with the site as it is now: `GET`/`POST /v1/suggestions/{id}/merge-check`
  says whether a suggestion would merge, its stage, what stops it, links left
  dangling, other suggestions changing the same items and each clash with the
  site; `POST /v1/suggestions/{id}/update` brings it up to date;
  `POST /v1/suggestions/{id}/resolve-ai` proposes how to settle each clash
  (machine-written, advice only); `GET /v1/suggestions/stages?ids=` gives a
  list's stages at once. The suggestion page and `/review` show this live,
  `/review` has Merge all, and the Send sheet names suggestions already
  waiting on the same place. MCP: `check_merge`, `bring_up_to_date`.
- What's new: Home has a band of what can now be heard and read (the
  Cheshvan and Kislev farbrengens transcribed by AI, the Likkutei Sichos
  text and Sefer HaSichos 5747–5752, read from the scans by AI), each
  labelled AI, with a button to `/new`, which lists every Cheshvan and
  Kislev farbrengen with a recording, year by year, to play at once.
- Every page has the same bar at its top: where it is on one side; Read ·
  Edit, the page's tools and its "…" on the other, in the same order and
  place on sefer, volume, text, farbrengen, shelf and Organize pages. On a
  phone the trail folds to one link up. Edit's hint sits in one place
  under the head, and everything that can change has the same outline,
  standing off its words. Opening a volume by its path (`/likkutei-sichos/30?edit`)
  keeps Edit.
- Pages with Read and Edit lose their separate Edit buttons; every
  detail of an item is one link from Edit's hint.
- A farbrengen has Read and Edit: in Edit its names change in place and
  its recordings' words open in the transcript editor, unchanged.
- Home is built around finding anything with AI in seconds (search by
  meaning when it is set up), the invitation to help build the biggest
  open library of Chabad's Torah, and listening to the Rebbe with the AI
  transcript. The phone's tabs are Home, Library, Listen, Contribute and
  You.
- Contribute (`/contribute`): Help, Review and Yours in one place, and
  the Send sheet, which lists every change before it is sent with an
  Undo for each, a name and a note for the reviewers.
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
