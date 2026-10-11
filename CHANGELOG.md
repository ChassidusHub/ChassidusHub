# Changelog

What changed, for the people who use ChassidusHub and the programs that read
it. The catalog itself changes every day and is not listed here: its
history is on every page, in `/v1/commits` and in the git mirror.

The API follows [semantic versioning](https://semver.org): nothing under
`/v1` is removed or changes meaning; new routes and fields may be added at
any time. `@chassidushub/client` carries the API's version.

## Unreleased

- The search page no longer offers "By idea" while its index is still
  empty (it answered nothing for every question); a question sent by idea,
  as the home page's box does, is searched by words. It comes back when the
  index is filled.
- Search by words is faster on a word nobody searched lately (#182): fewer
  sichos (40) and scan pages (300) are ranked, and only the sichos shown have
  their words read, the rest only when one of those shows nothing.
- `GET /v1/search/page` looks for a subject typed in English letters
  (`bitachon`, `ahavas yisroel`, `hashgacha pratis`) as the texts write it
  (`בטחון`), names and words alike, and says so in the new `topic` field.
  The subjects are a small list people keep (packages/core/src/topics.ts)
  (#99).
- Every API answer's `Server-Timing` also gives each statement's own time,
  in order (`db1;dur=…`, `db2;dur=…`, the first 16): which read a slow
  answer waited on.
- `GET /v1/mafteach`: a place in a volume kept page by page (Likkutei Sichos
  30-39) opens that page on the site (`text`), where most opened only the
  sicha's PDF; and whether the kept index is current is asked of each
  unit's place, not every version of the sefer (#100).
- `GET /v1/search/page` and `/v1/search/suggest` find a sicha or maamar by its
  own name (`דברים ב`, `Devarim 2`, `שבת חזון`) among `works`, after a sefer
  whose name is as good (#176).
- `GET /v1/search/moments` and `/v1/search/page` answer a common word (שבת,
  גאולה) faster: each match's words are ranked once, where it is found, and
  fewer are ranked (1000 pages, 1000 paragraphs, 100 sichos) (#172).
- `/v1/community` answers its sums (people, farbrengens without recordings
  or texts) from what the scheduled run keeps, at most 15 minutes behind;
  the latest merges and what waits are read on the request. Summing every
  farbrengen on a cold database made `/contribute` time out after a deploy
  (#171).
- `GET /v1/search/page` and `/v1/search/suggest` compare a title whole with
  the words as typed, small words and all: `Letters from the Rebbe` finds
  that title first again, after small question words were dropped (#123).
- `/v1/machine/to-check` and `/v1/mafteach` answer from what the scheduled
  run keeps, as `/v1/transcripts` does: working them out took longer than
  a request may run, so `/help` and `/mafteach` waited 30 s and failed
  (#104). What to check is at most 15 minutes behind; the subject index is
  built again within a run of one of its pages changing.
- `GET /v1/search/page` reads a language in the words (`Tanya in English`,
  `תניא באנגלית`) or takes `language=en` (the Language chip): only names in
  that language are listed, as `language`. Each hit in another language
  than Hebrew says which, as `languages`. Small question words (`what is`,
  `the`) no longer decide the results. `/v1/search/suggest` reads the
  language the same way (#123).
- `GET /v1/search/page` understands a parsha: words that are a parsha's
  name and nothing else (`בשלח`, `פרשת בשלח תשמ"ב`, `Beshalach`) come back
  as `parsha` with the farbrengens of its weeks, in the year given or in
  every year. Words that only end in one (`ואתה תצוה`) stay words, so the
  maamar that opens with them comes first (#90).
- A report can be opened without an account, as every page says: signed
  out, "Open the report" sends it without a name (the same hourly limit as
  the quick report on an item's page) and opens it as an issue. Before,
  the form ended in "Sign in to open a report" after it was written.
- On a phone the You tab lights only on your own pages, not on search.
  A sefer's pieces are counted in their own word (52 maamarim, letters,
  sichos), one printing is "1 printing", and a maamar with no text says
  "This maamar has no text here yet".
- The English home page has a "New here?" for someone who reads only
  English: who the Rebbe is, what Chassidus is, where to start (Tanya,
  Hayom Yom with English, Sichos In English, Books in English) and the
  words met everywhere (sicha, maamar, farbrengen, hanacha, kvius, Rosh
  Chodesh). Its search examples are ones a newcomer knows.
- `GET /v1/search/page`: the new site's search screen in one read, at most
  six statements. Sefarim and shelves the words name, farbrengens and
  recordings, and the places in the words (a sefer's paragraph, a line on
  a scan, the moment in a recording), each with its title and the line
  under it in Hebrew, a path that opens at the place, and where to mark
  the words. A date in the query is taken out of the words and puts
  its words first; a date alone lists that day's farbrengens. `top` is what
  was most likely looked for. `GET /v1/search/suggest` gives up to six
  names as someone types, in one statement.
- `/v1/search/moments` finds a sefer's own words too (a unit's text, with
  `textKind: "body"`, the paragraph's `segment`, `path` and `name`). A
  maamar that opens with the words comes first (`opening: true`), and
  words a person checked come before a machine's. `within` (a year, month
  or day, like `5711`) puts first what was said then, or what names that
  year in its own words (a maamar's heading, `ה'תשי"א`), then the rest
  (#167).
- `GET /v1/view` for a sicha, maamar or letter now has `scan` (the scan
  it is printed on and its PDF pages, even when it has words of its own,
  with the PDF's `url` where it is served from here) and `recordings`
  (the recordings of the farbrengens it was said at: id, path, name and
  length). A page with no words gives its PDF's `url` too. Still six
  statements at most.
- On the English pages the day's shiurim are named in English, from
  Sefaria's references (Genesis 6:9–22 with Rashi, Psalms 145–150, Robbery
  and Lost Property chapters 4–6, 30 Tishrei), and a name that is only a
  Hebrew month, such as Hayom Yom's volumes, is given its English name. The
  Hebrew pages are as before.
- `POST /v1/fix` fixes words in any text the one way: a sefer's own words,
  a transcript's paragraph, a line on a scan. A fix of up to 5 words goes
  live at once when the automatic check says it looks like a typo or a
  misreading fixed, in an open set, within a daily limit (RFC 0001); its
  author may undo it for a day with `POST /v1/fix/{changeset}/undo`. Only
  the words may change live: a fix that also changes bold, a link or a
  note is a suggestion. A machine's words a person fixed stay labelled:
  a sefer's and a transcript's are marked edited, a scan's line keeps its
  level, none is marked checked. Anything else is a suggestion, with the
  reason. `LIVE_FIXES=off` turns going live
  off.
- `GET /v1/view?path=…` (or `?id=`): one page of the new site in one read.
  It returns the item's facts, its path bar, the units before and after
  it, and the best words there are for it. Those are its own words, else
  a text of it, else the PDF pages of a scan it is printed on, else why
  they are held back. Machine words are marked: `machine` is none, some
  or all. It takes six database statements at most.
- A farbrengen's video shows as its still picture with a play button, and
  YouTube's player (about 1 MB) is fetched only when someone taps it, so
  the page's own recordings and words come first on a slow line. Without
  script the picture links to the video on YouTube. Opened from the
  keyboard, the player takes the focus, so the reader keeps their place.
- `GET /v1/view?path=…` (or `?id=`): one page of the new site in one read.
  It returns the item's facts, its path bar, the units before and after
  it, and the best words there are for it. Those are its own words, else
  a text of it, else the PDF pages of a scan it is printed on, else why
  they are held back. Machine words are marked: `machine` is none, some
  or all. It takes six database statements at most.
- `GET /v1/entities/{id}/path-bar`: an item's whole path for the new site's
  path bar, from the top of the tree down to the item (the Rebbe, his
  shelf, the sefer, the volume, the sicha). Each level lists the other
  choices at that level, and a volume says how many units it holds. It
  takes three statements however deep the path is.
- A shared sicha opens faster on a slow phone, and its words no longer
  jump as the fonts arrive: the reading fonts are served as WOFF2 (the
  words' face from 110 KB to 73 KB), the logo's face carries only its
  letters, the words' face is asked for with the page, and until the fonts
  come the page is drawn in a face the device has, sized to take the same
  room. Sicha and home pages load 30 KB less script: the full calendar is
  left to the pages that use it.
- Checking a transcript has a screen of its own, as the design draws it
  (design/system, board 6): Close, the recording's name and "…" at the
  top with a calm player (play, hear the last five seconds again, speed,
  how much is checked); the paragraph being checked large in a red frame,
  each paragraph with its state (machine, partly fixed, checked); Right,
  Fix and Not sure in the foot of the screen, where the box to fix the
  words opens too, with "Your fixes" under them; a word after each answer
  with Undo; when all is checked, the question whether the highlight
  followed the speech. With a keyboard, Tab stays on the screen (its head
  first) and Escape closes it; History on a paragraph opens again.
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
