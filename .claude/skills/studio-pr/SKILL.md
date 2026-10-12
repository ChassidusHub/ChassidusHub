---
name: studio-pr
description: Take a ChassidusHub pull request from branch to "REQUEST review" without bouncing (changelog file, up to date, browser tests, ready, hand-off line). Use before asking the Reviewer for a review.
---

# From branch to REQUEST review

Each step is here because pull requests were sent back for it (studio/status/studio-report.md).

1. **Branch and draft.** `claude/<team>-<subject>`; open a draft PR at once with the repo template,
   `Closes #N` and the milestone. A migration is its own PR, first and alone.
2. **Changelog: a new file, never an edit.** Write the entry in `changes/<subject>.md` (one or more
   `- ` paragraphs, as it should read in CHANGELOG.md). Editing CHANGELOG.md conflicts with every other
   open PR (changes/README.md).
3. **Build on what merges first.** If an approved or earlier PR touches the same files, build on its
   branch or wait for it; don't make a second version of its helpers. Merge main in with a merge
   commit (no rebase, no force-push) right before review.
4. **Run what CI runs.** `npm run check`; for apps/www also `npm run test:e2e -w @chassidushub/www`
   (browser tests and page budgets), which `npm run check` does not run. Both green before review.
5. **Read the diff against the standing rules.** Machine output is labelled until a person checks it
   (CLAUDE.md). On apps/www, pages show their frame at once and content comes after, within the
   budgets in studio/briefs/www/COMMON.md.
6. **Ready, then ask.** Mark the PR ready (CI skips drafts). Post `REQUEST review #N <head sha>` on
   the PR and send the same line to the "Studio Reviewer" thread's session (send_message; find it with
   list_thread_sessions).
7. **After APPROVE, push nothing**, not even "merge main": QA brings the branch up to date and merges.
   Any push of yours cancels the approval. Never merge your own PR.
