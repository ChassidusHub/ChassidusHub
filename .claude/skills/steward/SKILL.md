---
name: steward
description: How a Claude session drives its own ChassidusHub pull request to mergeable (conventions and how far to go on its own). Read when handling CI or review events on a ChassidusHub PR.
---

# Driving a ChassidusHub PR

ChassidusHub's merges are live deploys, so the repo has a gate that GitHub can't enforce by itself:

- Nothing reaches main without a comment `APPROVE <head sha>` from the Studio Reviewer on that exact
  commit, and only the Studio QA thread merges, one PR at a time. Never merge your own PR, even when
  CI is green and it is approved; when someone asks for it merged, send `HANDOFF approved #N <sha>` to
  QA instead.
- After an APPROVE, push nothing (not even a base merge): QA updates the branch itself. A push
  before APPROVE is fine and expected for CI fixes and review asks; then send a new
  `REQUEST review #N <head sha>` to the Reviewer, on the PR and by send_message.
- Base merges: merge main into the branch with a merge commit; never rebase or force-push.
- Conflicts in CHANGELOG.md: move your entry to `changes/<subject>.md` and take main's CHANGELOG.md.
- Reviewer comments starting "Changes needed" are blocking; fix every numbered item, then ask again.
- Before any push: the STOP switch (skill studio-turn) and `npm run check`; for apps/www also
  `npm run test:e2e -w @chassidushub/www`.
- Migrations are fixed forward, never reverted; a migration change goes in its own PR first.
