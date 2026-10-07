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
  the earlier. Kept in the browser until the drafts API (step 2).
- `ui/page/PageFrame.tsx`: crumbs, the title with `ModeSwitch`, the ⓘ
  panel, the edit hint and the `Tray`. A page's blocks get `editing` and
  draw themselves in either mode.
- `styles/page.css`: the frame, the switch, `.blk` outlines in Edit, the
  tray.

## Build order

One pull request each, merged as soon as checks pass (Shmuly: "make it
merge right away"); each new screen replaces the old one as it lands.

1. Tokens, parts and the page frame.
2. Drafts and operations on the server (`PUT /v1/drafts/:id/ops`,
   `POST /v1/drafts/:id/send`); today's write endpoints become wrappers,
   so the MCP tools and the reader app are untouched.
3. Text pages (sicha, letter, chapter, maamar) in Read and Edit.
4. Sefer and volume pages.
5. The library, with Organize as its Edit mode.
6. Contribute, the Send sheet and Review.
7. Home with AI search, navigation and You.
8. Listen and farbrengen pages; the transcript editor is wrapped, not
   rebuilt.
9. The old screens and their styles removed; old addresses redirect.
