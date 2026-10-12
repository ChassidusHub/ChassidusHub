# Contributing to ChassidusHub

Thank you for helping. There are two kinds of contribution, and the first
needs no technical knowledge at all.

## 1. Fixing and adding to the catalog

The catalog - every sefer, printing, scan, text, farbrengen and recording -
is not kept in this repository's files. It lives in ChassidusHub's own
versioned database, where every change is a **suggestion** that a **set
keeper** approves, and every version is kept (see
[docs/versioning.md](docs/versioning.md)). An export of the whole catalog
is published after every change for anyone to download.

The easiest way is on [chassidushub.org](https://chassidushub.org) itself: every
page has *Report a problem* (no account needed) and *Suggest a fix*. With
an account you can edit, add scans and recordings, proofread, and join a
**project**. Scripts and AI agents can do the same through the API with a
personal token, and their suggestions are reviewed like anyone's
([developer docs](https://chassidushub.org/developers)).

GitHub issues work too, and a keeper turns each into a suggestion and
credits you:

- **Something is wrong** - a date, a name, a missing page, a bad scan:
  [open a report](https://github.com/ChassidusHub/ChassidusHub/issues/new?template=1-catalog-report.yml).
- **Something is missing**: [tell us](https://github.com/ChassidusHub/ChassidusHub/issues/new?template=2-missing.yml).
- **A rights question or takedown**: [ask here](https://github.com/ChassidusHub/ChassidusHub/issues/new?template=3-rights.yml),
  or on the site at [/takedown](https://chassidushub.org/takedown).

Please never attach files you do not have the right to share, and never
paste the text of a copyrighted sefer. Link to where it is instead.

## 2. Working on the code

### Getting started

```sh
git clone https://github.com/ChassidusHub/ChassidusHub && cd ChassidusHub
npm install
npm run check        # typecheck, tests, schema check - the same as CI
```

Node 22 is all you need; tests run on PGlite, an in-process Postgres. To
test against a Postgres server too, set `CHASSIDUSHUB_TEST_DATABASE_URL` to an
**empty** database (the tests drop its `public` schema):

```sh
CHASSIDUSHUB_TEST_DATABASE_URL=postgres://localhost/chassidushub_test npx vitest run --no-file-parallelism
```

### The flow

Every merge to `main` is a live deploy of chassidushub.org, and the API's
build runs the database migrations. So nothing reaches `main` without a
review of the exact commit, and one place merges.

1. **Find or open an issue** for what you want to change, so the work is
   visible and nobody does it twice. For anything larger than a fix, say
   how you plan to do it before you start. A change to the core (data
   model, schema, the API's meaning, the merge engine, rights) starts as
   an RFC in [docs/rfc/](docs/rfc/0000-template.md).
2. **Branch** from `main`, named for what it does:
   `fix/segment-order-after-revert`, `feat/iiif-manifests`,
   `docs/rights-policy`, `chore/update-vitest`. The studio's lanes use
   `claude/<lane>-<subject>`.
3. **Commit** in small steps with messages that say what and why:
   a short first line ("Keep path redirects when an item is deleted"),
   then, if needed, a paragraph on the reason.
4. **Open a pull request** early - a draft is fine - using the template,
   saying `Closes #N` and the milestone. CI runs the checks on PGlite and
   on Postgres 16.
5. **Review**: when CI is green, ask for review. The reviewer reads the
   diff against the issue's acceptance criteria and, when it is right,
   comments exactly `APPROVE <head sha>` - the full sha of the commit
   approved. Any later push cancels it; the new head needs its own
   `APPROVE`. Changes to the data model, the database schema, rights,
   governance or `.github/` also need a steward ([CODEOWNERS](.github/CODEOWNERS)).
6. **Merge**: only the QA lane merges, one pull request at a time. It
   brings the branch up to date, waits for green CI, squash-merges with
   the approved head sha, waits for both deploys, and runs the smoke
   test. Nobody merges their own pull request. A migration ships in its
   own pull request, first and alone, and is never reverted - it is fixed
   forward with a new one.

**Stop switch.** While an issue titled `studio-stop` is open, nobody
pushes or merges; finish the commit locally and wait.

### Rules of the house

- **TypeScript everywhere**, strict, ES modules; npm workspaces; vitest.
  Match the style of the code around you: plain-language doc comments that
  say *why*, in the words of the plan.
- **Tests with every change** of behaviour. Tests run against package
  sources (`vitest.config.ts` aliases), so nothing needs building first.
- **Migrations are never edited once released.** Change the schema with a
  new migration in `packages/db/src/migrations/`.
- **The model is shared with Sichos-Kodesh.** The works contract in
  `packages/model/src/works.ts` changes only together with it
  ([docs/sichos-kodesh.md](docs/sichos-kodesh.md)).
- **Machine output is labelled** until a person checks it. Never present
  OCR, transcription or sync as the Rebbe's words.
- **No restricted content in the repository**: no texts, scans or
  recordings. Tests use short made-up or public-domain samples.
- **Secrets never in git**: signing keys, database URLs, API tokens.
  Settings that differ from one deployment to another are listed, by name,
  in [docs/configuration.md](docs/configuration.md).
- **The API is versioned.** Nothing under `/v1` is removed or changes
  meaning; every route is in `services/api/src/openapi.ts`, and a test
  fails when one is not. After changing it, run
  `npm run generate -w @chassidushub/client` and add a changelog entry
  (CI fails an API change without one).
- **Changelog entries are new files, not edits.** Add
  `changes/<subject>.md` with the entry; don't edit
  [CHANGELOG.md](CHANGELOG.md), where every open pull request's entry
  would conflict with the next merge ([changes/README.md](changes/README.md)).

### Labels

`report`, `missing`, `rights` (catalog issues) · `type:bug`,
`type:feature`, `type:chore`, `type:rfc`, `idea` · `P1` … `P3` (priority) ·
`own:<lane>` (who owns it) · `ready`, `claimed`, `blocked`,
`needs-shmuly` (state) · `main-red`, `freeze` · `discovery` (found by
visiting the site) · `good first issue`, `help wanted`. Milestones M0 … M6
are the roadmap's goals.

## Conduct

Everyone here follows the [community and content policy](CODE_OF_CONDUCT.md).
