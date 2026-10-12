- A moderated set can take small fixes live (`liveFixes: true` on the set,
  RFC 0001; built-in schemas version 18): a reader's fix of a few words,
  passed by the AI check, goes live at once there and waits on the
  keep-or-undo list. Every shelf on the live site is moderated, so until a
  steward turns this on for them no fix goes live.
- The new site on a phone: Fix opens the words box with the keyboard up
  (iOS Safari raised none), the fix sheet stands above the keyboard so
  Save is not under it, and the bar over selected words sits clear of the
  phone's own selection handles. Opening Edit no longer reads the page
  again first, and a name saved for a second look can be changed again in
  the same Edit instead of being refused as "the page changed".
- `npm run dev:api` takes `LIVE_FIXES=on`, so Fix and Undo can be walked
  locally; `node scripts/fix-edit-walk.mjs` in apps/www walks select, Fix,
  sign in, live, Undo and Edit on a phone and times each step.
