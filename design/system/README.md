# The ChassidusHub design system ("Sefer 2")

The approved design for the site, the app and everything in between:
mockups to build from, not code to ship. Open any `.dc.html` in a browser
(they load `../support.js`), or the whole canvas as it was drawn. Boards
marked "try it" have working controls.

`canvas.json` lays the boards out; its titles number them. The words
inside the mockups are placeholders (`[מילה]`, `כאן יופיעו מילות…`): no
texts are kept here.

## What it decides

- **Phone first.** Every screen is drawn at 390px first; a larger screen
  adds a second column and keys, never another way of working.
- **Three levels: Read, Help, Steward** ("What you see"). A higher level
  only adds tools.
- **One accent, the sefer palette**, Hebrew first, machine output always
  labelled with the amber dot.
- **Editing and checking, one way** (boards 3–9): the source on top, the
  words, three answers (Right · Fix · Not sure), and a "Your fixes" tray
  that sends one Suggestion for each place.
- **The transcript page** (6a–6d): the word being said in solid red, a
  calm player, and in the regular mode a tap on a word that offers
  "תיקון" right there, fixed inline.
- **Suggestions show only what changed** (22–28): a sentence first, the
  changed words with four words around them, no ids or field paths.
- **Home** (29–32): a chat-like page, one box to ask or search, and this
  week in the year of the same kvius (lib/week.ts `kviusYears`).

## Boards

| # | Board | |
| --- | --- | --- |
| 0–2 | Main, Foundations, Components | the plan, tokens, parts |
| 3–9, 6a–6d | EditPlan … DeskCheck, PhoneListen, ListenRules, PhoneListenRead, DeskListen | editing, checking, the transcript page |
| 10–14 | PhoneRead, PhoneMenu, PhoneSettings, Reader, Settings | reading, menu, settings |
| 15–21 | LibPlan … DeskLibrary | library and PDF |
| 22–28 | SuggestPlan … DeskSuggestion | suggestions and merges |
| 29–32 | HomePlan, PhoneHome, PhoneAsk, DeskHome | home and Ask |
| 33–42 | PhoneDaily … DeskWelcome | daily learning, calendar, you, states |
| 43–46 | PhoneHomeDark … PhoneReadEN | dark and English |
| 47–50 | AppPlan … AppDownloads | the app (reader/) |

## Building it

In this order, one pull request each: tokens and parts
(apps/web/app/styles/tokens.css, parts.css, ui/primitives.tsx), the
transcript page, home, editing and checking, library and PDF,
suggestions, daily and the rest, dark and English, then the app (its
web part at once, Android at a release, per reader/CLAUDE.md).
