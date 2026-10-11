# RFC 0001: Small fixes go live after an AI check, and can be undone

- Status: accepted (the Director, 2026-10-11)
- Issue: the new site's fixing (studio/briefs/www/4-fix-edit.md, DATA.md)
- Author (lane or person): Data lane
- Date: 2026-10-11

## Problem

Shmuly approved the new site on 2026-10-11 ("yes, set up a workers army and get it done";
plan https://claude.ai/code/artifact/3ce74147-3357-41a0-8348-b527d362426c). In it, fixing is:
select words, Fix, type, and it is live after a small AI check, with Undo.

Today a fix almost never goes live:
- A fix goes live only when its author is trusted (20 approved suggestions and none
  reverted) and every set it touches is open (`mayGoLive`, packages/core/src/permissions.ts).
- It must also touch only `text-page`, `segment` or `alignment-span`. A sicha's own
  words (a unit's `body`) are never live, because `unit` is not one of those types.
- So a new reader's fix of one wrong letter waits on /review like a new sefer would.
- Each kind of text has its own route, with its own input and answer:
  - `POST /v1/suggestions/words` for a body,
  - `POST /v1/recordings/{id}/transcript/fix` for a transcript paragraph,
  - `POST /v1/scans/{id}/text/fix` for a scan's line.
- Nothing limits how many fixes one person sends in a day.

## Proposal

**One route for every kind of text**: `POST /v1/fix`, signed in only.

```
{ item, version?, segment, before, after }   // segment: a body segment id, a segment id, or "page:line" on a scan
→ 201 { changeset, live: true,  undo: "/v1/fix/{changeset}/undo" }
→ 201 { changeset, live: false, reason }     // waits for a reviewer, as a suggestion
```

`before` is the segment as the person saw it. If the words changed since, the route answers
409, as `/v1/suggestions/words` does now. The change is made by the existing functions
(`applyWords`, `fixParagraph`, `fixLine`), so a fix is an ordinary suggestion with its
history, diff and revert.

**A small fix goes live at once**, without trust, when all of these hold:
1. **Small**: at most 5 words differ between `before` and `after`, by the word diff in
   packages/core/src/words.ts. Anything larger is a suggestion, as now.
2. **The AI check passes.** One Workers AI call, in the account the API already uses for
   advice (`CLOUDFLARE_AI_TOKEN`), asks only: "is this a plausible correction of a typo or
   misreading, and not vandalism, spam or a change of meaning?" The answer is yes or no.
   - It sends the segment's words, before and after, and nothing else. No name, no account.
   - It has a 3-second timeout.
   - Model down, slow or unsure means the fix waits for a reviewer. It is never refused
     for that reason.
3. **Within the daily limit**: 50 live fixes a day for a contributor, 500 for a trusted
   person, none for a suspended account or one in its first 24 hours without an approved
   suggestion (the upload hold). The count is of the person's `live` changesets in the
   last 24 hours, in one statement, like `uploadAllowance`. Over the limit, the fix waits.
4. **The set allows live fixes**: its policy is `open`, or `moderated` with live small
   fixes (a new policy flag, below). A `closed` set never takes live fixes.

**It shows who**: a live fix is `kind: 'live', post_review: 'pending'`, as live fixes are
now. It is on the back room's "keep or undo what went live today" list (`reviewLive`).
Words a machine made and a person fixed are marked `edited`, not checked. Fixing is not
checking, so the machine label stays until someone checks the paragraph.

**Undo**:
- `POST /v1/fix/{changeset}/undo` by its author, within 24 hours and while nothing has
  changed the segment since, reverts it with a merged `revert`.
- An author's own undo does not count against their trust. A reviewer's revert does, as now.
- After 24 hours, or once someone else has changed the segment, it is an ordinary revert
  on /review.

**What changes in the core**:
- `mayGoLive` gains a second path for small checked fixes: the type list grows to `unit`,
  for a body segment only. Live never covers a unit's other fields.
- A set policy flag, `liveFixes: true`, lets a moderated set take them. The fixed tree's
  shelves get it in a suggestion Shmuly approves on /review, not by default.
- One migration, in its own PR first: the `changeset` index the daily count needs
  (`author, kind, created_at`). It adds an index only, so it is not destructive.

## Cost and risk

- **Work**: the Data lane, as three PRs:
  1. the migration (the index);
  2. the core (`mayGoLive`, the limits, undo);
  3. the route and its AI check.
  The Fixing thread builds the sheet on top.
- **Running cost**: one small Workers AI call per fix: a short prompt and about 5 tokens
  out. That is well inside the account's free allowance at today's traffic.
- **Live site risk**: a bad fix is live until someone undoes it. Bounded by:
  - the 5-word cap,
  - the AI check,
  - the daily limit,
  - the 24-hour new-account hold,
  - every live fix waiting on the keep-or-undo list.
  Reverting is the existing, tested path.
- **It can be undone**: a setting turns live small fixes off (`LIVE_FIXES=off` on the API).
  Then every fix waits for a reviewer, as today.
- **What it asks of Shmuly**:
  - Sending a segment's words to Workers AI in his own Cloudflare account is within the
    approved plan ("a small AI check on Workers AI in Shmuly's Cloudflare account").
  - The `liveFixes` flag on the fixed tree's shelves is his to approve, on /review.

## Alternatives

- **Trust only, as now**: new readers never see their fix live, which is the opposite of
  the approved design.
- **Live without an AI check**: no guard but the limit against spam on a public site.
- **The AI as the only judge**: no word cap, so one wrong "yes" could rewrite a paragraph.
- **A per-minute limiter (platform.ts)** instead of a daily count: it resets each minute
  and is kept in memory per isolate, so it cannot count a day.
