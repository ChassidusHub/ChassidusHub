# ChassidusHub

The open, community-edited index of Chabad Torah and media. The plan is
docs/plans/chassidushub.md; what is built and what is next is docs/roadmap.md.

## Working here

- `npm run check` before every push (typecheck, tests, schema check). Tests
  run on PGlite; set CHASSIDUSHUB_TEST_DATABASE_URL to an empty Postgres
  database to run them on a server too (`--no-file-parallelism`).
- Every merge to main is a live deploy and runs migrations. Nothing
  reaches main without a comment `APPROVE <head sha>` from a reviewer on
  that exact commit (a later push cancels it), and only the QA lane
  merges, one PR at a time. Never merge your own PR.
- Branches `claude/<lane>-<subject>` (people: `fix/…`, `feat/…`, `docs/…`,
  `chore/…`); open a draft PR at once using the template, with
  `Closes #N` and the milestone. The board is this repo's issues
  (labels own:<lane>, P1-P3, type:…, ready, claimed, blocked).
- Stop switch: before any push or merge, check for an open issue titled
  `studio-stop` (and the studio's STOP file); if either exists, commit
  locally and stop.
- A migration ships in its own PR, first and alone, and is never reverted
  (fixed forward). A core change starts as an RFC in docs/rfc/.
- Migrations in packages/db/src/migrations are never edited once released;
  add a new one.
- packages/model/src/works.ts is Sichos-Kodesh's works contract, kept
  verbatim; change it only together with Sichos-Kodesh
  (docs/sichos-kodesh.md). ChassidusHub keeps no copy of Sichos-Kodesh's
  content: importers read a checkout at run time.
- Never commit texts, scans or recordings, or any signing key or secret.
- The OCR engines and their training code live in the private
  ChassidusHub/RebbeHub-OCR repo, never here: this repo is public, and model
  and training code stay private. Scans, line images and models stay out of
  git, in the ocr-training R2 bucket.
- reader/ is the ChassidusHub app for readers, Android and web (formerly the
  Sichos Kodesh app, moved from shmuky/Sichos-Kodesh; docs/plans/reader-app.md):
  its own npm workspace and lockfile, its own rules (reader/CLAUDE.md: no
  Android build unless asked), workflows at the root as reader-*.yml and tags
  reader-v… / reader-catalog-v…. No texts: it reads them from ChassidusHub.
- Machine output (OCR, transcription, sync) is always labelled until a
  person checks it.
- Write like the code around you: plain-language doc comments that say
  why, in the plan's words (Suggestion, Report, Approve, Project, Set).
