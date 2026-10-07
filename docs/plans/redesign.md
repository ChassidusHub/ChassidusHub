# The redesign: every page you can read is a page you can fix

Approved by Shmuly on 2026-10-07. The full plan, with mockups of the key
screens, is the "ChassidusHub Redesign Plan" page in the project
(https://claude.ai/artifact/Ua7QY84dqbrC9vzzEsPVN1). This file keeps what
the code relies on.

## Rules

1. Every page has two modes, Read and Edit, at the same address: Edit is
   `?edit`. Edit adds handles to what is already on the page; there is no
   separate editing page.
2. Five places: Home, Library, Listen, Contribute (Help, Review, Yours) and
   You. History, discussion, sources and ids are in each page's ⓘ panel.
3. One way to change anything: every block writes an operation into your
   draft (the tray), sent as one Suggestion.
4. Colour means one thing each: red is ChassidusHub (links, the main
   button), blue (`--mine`) is yours and not sent yet, amber (`--machine`)
   is a machine's words nobody checked, green (`--ok`) is checked or
   approved.
5. Show content, hide machinery: names, not numbers; sentences, not field
   names.
6. Phone first; no page is ever wider than the screen.

Home leads with finding anything with AI in seconds (an ask box whose
answers cite the exact places), listening to the Rebbe with the AI
transcript, and the invitation to help build the biggest open library of
Chabad's Torah: לכשיפוצו מעינותיך חוצה.

## The parts

- `lib/editMode.ts`: `?edit` read and written.
- `lib/draft.ts`, `lib/useDraft.ts`: your changes not sent yet, one draft
  per page (its permanent id); a later change to the same thing replaces
  the earlier. Kept in the browser at once and on the account
  (`/v1/drafts`, packages/core/src/drafts.ts) a moment later; sent as one
  Suggestion with `POST /v1/drafts/<page id>/send`.
- `ui/page/PageFrame.tsx`: crumbs, the title with `ModeSwitch`, the ⓘ
  panel, the edit hint and the `Tray`. A page's blocks get `editing` and
  draw themselves in either mode.
- `styles/page.css`: the frame, the switch, `.blk` outlines in Edit, the
  tray.

## Build order

One pull request each, merged as soon as checks pass (Shmuly: "make it
merge right away"); each new screen replaces the old one as it lands.

1. Tokens, parts and the page frame.
2. Drafts and operations on the server (`PUT /v1/drafts/<page id>`,
   `POST /v1/drafts/<page id>/send`), with `set` and `words` changes; more
   kinds join as their screens are built. Today's write endpoints stay as
   they are, so the MCP tools and the reader app are untouched.
3. Text pages (sicha, letter, chapter, maamar) in Read and Edit. In
   Edit every paragraph is outlined; a tap opens it in place, and Done
   puts the change into the page's draft (blue until sent). "Right" marks
   a machine's paragraph checked; Remove and "Add a segment after" are
   changes like any other, each with its own Undo. The tray sends them as
   one Suggestion and says what came of it.
4. Sefer and volume pages. A sefer's names (Hebrew and English) and its
   few words are Fields: words in Read, a box to change in Edit. A volume
   lists its sichos by their real names under their parshiyos (a sicha
   kept in numbered pieces is one row, not "1", "2", "3"), and in Edit
   each sicha's name can be changed in place.
5. The library, with Organize as its Edit mode. The library and each
   shelf carry Read · Edit; the library's Edit (`/sets?edit`) is Organize
   on that shelf, and Organize's Read goes back to what it organizes. A
   shelf's own page in Edit changes its names and few words as Fields,
   with a button to move and order what is on it.
6. Contribute, the Send sheet and Review. `/contribute` has Help (what
   there is to do, each leading to where it is done), Review (what waits,
   and the review queue) and Yours (your changes not sent yet, from this
   browser and your account, each reopening its page in Edit; what you
   sent). The tray's Send opens the Send sheet: every change with its own
   Undo, an optional name and a note for the reviewers.
7. Home with AI search, navigation and You. Home asks "Find anything
   with AI, in seconds": the box searches by meaning when that is set up
   (else by words, reading a parsha, a day and a year out of them), with
   a few searches to try. Under it, the motto לכשיפוצו מעינותיך חוצה and
   the invitation to help build the biggest open library of Chabad's
   Torah, using modern technology and AI to make all of it accessible.
   Listening comes first in the feed, each transcript labelled "AI
   transcript". The phone's tabs are Home, Library, Listen, Contribute
   and You (the menu); the wide header keeps Daily learning.
8. Listen and farbrengen pages; the transcript editor is wrapped, not
   rebuilt. A farbrengen has Read · Edit: in Edit its names are Fields
   and its recordings' words open in the transcript editor as it is (the
   Text tab, which stays for old links).
9. The old screens and their styles removed; old addresses redirect.
