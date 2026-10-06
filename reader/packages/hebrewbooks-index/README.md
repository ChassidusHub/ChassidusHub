# @chassidushub-reader/hebrewbooks-index

The Chabad shelf of HebrewBooks.org (`docs/chabad-library-plan.md`, section
2a and WP19): every scanned sefer HebrewBooks holds by one of the Rebbeim,
and every other Chabad book there, grouped by author and series. It keeps
bibliographic facts and each book's HebrewBooks id, never the scans. The
apps link each book to its page, `hebrewbooks.org/<id>`, which HebrewBooks'
terms allow; its PDFs and copies of them need its permission (decision 2).

## Where the list comes from

HebrewBooks has no public API. Otzaria, the open-source seforim app,
publishes the whole HebrewBooks catalog as a SQLite file, and this package
reads that file:

- `otzar-HB_catalog.db.zst`, from the latest release of
  [Otzaria/otzar-HB_catalog](https://github.com/Otzaria/otzar-HB_catalog)
  (6 MB compressed, a 37 MB SQLite file);
- only its `hebrew_books` table and `db_meta.version` are read. The Otzar
  HaChochma table and Otzaria's own text mapping are not.

The apps credit Otzaria for the list on their About screens.

## What is on the shelf

A book is on it when:

- its first author is one of the Rebbeim, the Baal Shem Tov or the Maggid,
  as the catalog writes them (`שניאור זלמן בן ברוך (אדמו"ר הזקן)` and so
  on); the authors after a `;` are editors and commentators;
- or the catalog tags it `חבד` / `חב"ד`, or a Chabad yeshiva or
  institution published it. Those go under `authorId: null`.

A title splits into a series and a volume, however the catalog writes the
volume:

| Title | Series | Volume |
| --- | --- | --- |
| `לקוטי שיחות - א (בראשית - שמות - ויקרא)` | `לקוטי שיחות` | `א (בראשית - שמות - ויקרא)` |
| `ספר המאמרים תרנ"ט` | `ספר המאמרים` | `תרנ״ט` |
| `אגרות קודש (אדמו"ר מוהרש"ב) ג` | `אגרות קודש (אדמו״ר מוהרש״ב)` | `ג` |
| `תורת מנחם התוועדויות לה - תשכ"ג (חלק ראשון)` | `תורת מנחם התוועדויות` | `לה - תשכ״ג (חלק ראשון)` |

- The last row is a bare numeral after a series the author already has;
  a second pass folds it into that series.
- Series match on a key without quotes and with the common spelling
  variants made one (`ליקוטי` / `לקוטי`, `שולחן` / `שלחן`).
- A series' volumes are ordered by the numbers they carry (`תשמ״ה - חלק ב`
  is 745, 2).

Placing a series with its sefer is not done here. packages/works does it
(`src/shelf.ts`, with the names kept by hand in `src/registry/hebrewbooks.ts`),
because the registry is where the works are curated.

## Running it

```
curl -L -o otzar-HB_catalog.db.zst \
  https://github.com/Otzaria/otzar-HB_catalog/releases/latest/download/otzar-HB_catalog.db.zst
npm run import-hebrewbooks -w @chassidushub-reader/hebrewbooks-index -- --catalog otzar-HB_catalog.db.zst
npm run build-catalog-works -w @chassidushub-reader/works -- --imports <sefaria data> --imports <igros import>
```

`import-hebrewbooks` writes `data/shelf.json` (gitignored).
`build-catalog-works` places it and writes the apps' `shelf.json`, which is
committed. The first run (catalog version 9, 2026-09-24):

| Author | Scans | Series |
| --- | --- | --- |
| The Baal Shem Tov | 25 | 18 |
| The Maggid | 9 | 6 |
| The Alter Rebbe | 140 | 49 |
| The Mitteler Rebbe | 66 | 22 |
| The Tzemach Tzedek | 87 | 19 |
| The Rebbe Maharash | 31 | 4 |
| The Rebbe Rashab | 70 | 24 |
| The Frierdiker Rebbe | 132 | 42 |
| The Rebbe | 506 | 86 |
| Other Chabad books | 473 | 151 |
| **Total** | **1,539** | **421** |

689 of the scans are placed with a sefer the catalog knows.

## Scripts

```
npm test -w @chassidushub-reader/hebrewbooks-index        # a synthetic catalog, .db and .db.zst
npm run typecheck -w @chassidushub-reader/hebrewbooks-index
```

`@chassidushub-reader/hebrewbooks-index/series` is the title logic alone, with no
Node modules. packages/works imports it, and the apps bundle packages/works.
