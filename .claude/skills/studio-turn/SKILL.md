---
name: studio-turn
description: Start and end of every turn for a studio thread working on ChassidusHub (STOP switch, goals, claim, live-database guard, status file). Use at the start of any turn that may push, merge or run the app.
---

# A studio thread's turn

The studio is the set of Claude threads that build ChassidusHub; its files are in the project's shared
folder, /mnt/project-files/studio/ (plan: studio/plans/five-teams.md).

## Start

1. **STOP.** If /mnt/project-files/studio/STOP exists, or an open issue is titled `studio-stop`
   (`gh api "repos/ChassidusHub/ChassidusHub/issues?state=open" --jq '.[].title'`), commit locally,
   write your status file, and stop: no push, no merge.
2. Read studio/GOALS.md, your brief (studio/briefs/<team>/…, built from studio/briefs/TEMPLATE.md) and
   your issue.
3. **The live database.** In cloud sessions DATABASE_URL is the LIVE database, and `npm run dev:api`
   migrates whatever it points at. Start every local run with `env -u DATABASE_URL`.
4. One issue at a time, at most two open PRs. Claim with a comment `CLAIM <team> until <UTC>` (12 h).

## End

- Write studio/status/<team>.md: what changed, what waits, on whom.
- At a merge, studio/handoff/<team>.md.
- Messages to other threads start with REQUEST, HANDOFF, BLOCKED or MERGED, and go by send_message to
  that thread's session as well as on the PR: a PR comment alone reaches nobody.
