# A sample catalog for local work

A database made with `migrate` alone is empty, so the site on your own
machine has nothing to show. `npm run sample` loads a small made-up catalog
into the local PGlite database (`.data/pglite`), enough to see and check
every kind of page without production data:

- The Alter Rebbe's and the Rebbe's shelves (`/sets/alter-rebbe`,
  `/sets/the-rebbe`), with two sefarim shelves under the Rebbe's, official
  sefarim, and additions: one to a sefer (shown on its page) and one to no
  sefer (apart at the end of the shelf).
- Likkutei Sichos with three volumes of sichos, so shelves show volume
  counts; Hayom Yom days; a maamar.
- Tanya, Likkutei Amarim chapters 1 to 3 (`/tanya/1/1`), with words to
  read and fix: a heading, paragraphs, a gloss and a footnote.
- A farbrengen (`/events/5742-05-10`) with a recording and its machine
  transcript, timed word by word. The audio is a soft tone made by the
  command, written to `.data/files`.
- Three open suggestions for `/review` (a fix to Tanya's words, a new sicha,
  a fix to a transcript line), and one report on `/issues`.
- Accounts: `dev`, a steward and the keeper of every set, and two
  contributors, `mendy` and `chaim`.

Every word in it is sample text written for it (it says לדוגמה), never a
sefer's own words: the repository holds no texts, scans or recordings.

## Running it

```sh
npm run sample                     # once; again does nothing
DEV_ACCOUNT=dev FILES_DIR=.data/files npm run dev:api
npm run dev:web                    # http://localhost:5173
```

On Windows (PowerShell), set the two settings first:

```powershell
$env:DEV_ACCOUNT = "dev"; $env:FILES_DIR = ".data/files"; npm run dev:api
```

`DEV_ACCOUNT` signs every API request in as that account, and the site shows
you signed in as it, so signed-in screens (review, approving, editing) can be
checked. It is refused unless the API listens on localhost. The account page's
own settings (passkeys, handle, email) still need a real sign-in, since the
account has no person of its own.

`FILES_DIR` is where the API finds the recording's audio; without it the
farbrengen shows its recording and transcript, but nothing plays.

## Options

- `--as <account>`: the account to make steward and keeper (`dev`).
- `--files <dir>`: where the audio goes (`.data/files`).
- `--database <folder>`: another PGlite folder. The command refuses a
  Postgres address: it never writes to a server, the live one least of all.
  If `DATABASE_URL` is set in your shell, unset it or pass `--database`.

To start again, delete `.data/pglite` (and `.data/files`) and run it again.
