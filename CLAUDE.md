# ChassidusHub

The open, community-edited index of Chabad Torah and media. The plan is
docs/plans/chassidushub.md; what is built and what is next is docs/roadmap.md.

## Working here

- `npm run check` before every push (typecheck, tests, schema check). Tests
  run on PGlite; set CHASSIDUSHUB_TEST_DATABASE_URL to an empty Postgres
  database to run them on a server too (`--no-file-parallelism`).
- Branch from main (`fix/…`, `feat/…`, `docs/…`, `chore/…`), open a PR
  using the template; CODEOWNERS review.
- Migrations in packages/db/src/migrations are never edited once released;
  add a new one.
- packages/model/src/works.ts is Sichos-Kodesh's works contract, kept
  verbatim; change it only together with Sichos-Kodesh
  (docs/sichos-kodesh.md). ChassidusHub keeps no copy of Sichos-Kodesh's
  content: importers read a checkout at run time.
- Never commit texts, scans or recordings, or any signing key or secret.
- ocr/ is the OCR engines (Python, moved from shmuky/RebbeHub-OCR): its own
  README and plan (ocr/docs/plans/ocr-engines.md). Scans, line images and
  models stay out of git, in the ocr-training R2 bucket.
- reader/ is the ChassidusHub app for readers, Android and web (formerly the
  Sichos Kodesh app, moved from shmuky/Sichos-Kodesh; docs/plans/reader-app.md):
  its own npm workspace and lockfile, its own rules (reader/CLAUDE.md: no
  Android build unless asked), workflows at the root as reader-*.yml and tags
  reader-v… / reader-catalog-v…. No texts: it reads them from ChassidusHub.
- Machine output (OCR, transcription, sync) is always labelled until a
  person checks it.
- Write like the code around you: plain-language doc comments that say
  why, in the plan's words (Suggestion, Report, Approve, Project, Set).
