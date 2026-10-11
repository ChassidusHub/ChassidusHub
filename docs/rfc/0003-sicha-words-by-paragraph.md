# RFC 0003: A sicha's words by paragraph, for search

- Status: proposed (needs Shmuly's OK: a new read table, per the speed audit)
- Issue: #214
- Author (lane or person): Data lane
- Date: 2026-10-11

## Problem

A search for a common word still takes about a second the first time it is
run (QA after #209/#210: cold חסידות 1130 ms, of which 643 ms is reading
sichos' words; the first search after a deploy took 1066 ms, 522 ms of it on
those words). #214 asks for under a second, every time.

The cost is how a sicha's words are kept. To show a sicha in the results,
search picks the paragraph that holds the words best and shows a few words
around them (`unitRows` and `unitMoment` in packages/core/src/moments.ts).
A sicha's words are its `body`, inside its revision's `data`. That `data` is
one jsonb value, stored compressed outside the row (TOAST), so reading any
part of it reads and unpacks all of it: a Likkutei Sichos sicha is some 80
to 117 KB. Search shows 20 results, so a common word reads 20 whole sichos,
about 2 to 3 MB, to show 20 short snippets. On the live database (1 vCPU,
2 GB, so little of it stays in memory) that is mostly disk reads.

Locally, on the synthetic catalog (1,500 sichos of about 117 KB each), reading
the 20 bodies takes 6,900 to 6,920 buffers for a common, a mid and a rare word
alike. Every buffer is a disk read when the cache is cold.

The other parts of a search are already small: the moments ranking after #215
reads about 3,000 buffers, and the names (db3) about 2,900 after #209. QA
timed live after #215 deployed: a cold חסידות took 978 ms, of which 567 ms
was the sichos' words (db5) and 145 ms the moments ranking (db4). A cold רבי
took 1,452 ms, 593 ms of it db5. The words are now more than half of a cold
search.

## Proposal

Keep each sicha's words a second time, split by paragraph, in a table that
search reads instead of the revision. Each paragraph is its own small row,
so search reads only the few paragraphs that hold the words.

```sql
CREATE TABLE unit_text (
  unit_id  TEXT COLLATE "default" NOT NULL,  -- the sicha; entity's collation, so joins can use entity's key (#182)
  n        INT  NOT NULL,                    -- the paragraph's place in the first version
  seg_id   TEXT NOT NULL,                    -- the paragraph's id in the body, for the link to it
  kind     TEXT,                             -- heading, paragraph, ...
  words    TEXT NOT NULL,                    -- its words as one line, its children's too (segmentWords)
  tsv      TSVECTOR NOT NULL,                -- those words, as searched (the same normalizing as unit_place.lead)
  machine  BOOLEAN NOT NULL,                 -- a machine wrote it and nobody has checked it yet
  PRIMARY KEY (unit_id, n)
);
```

- **What it holds.** One row per paragraph of each live sicha's first
  version (`body.versions[0].segments`), the same lines `unitMoment` builds
  today. Footnotes and other versions are left out, as they are now.
- **Rights.** Whether a sicha's words may be shown (`bodySource.rights`) is
  a fact about the whole sicha, not a paragraph, so it goes on `unit_place`
  as one new column, `rights`, kept by the same trigger.
- **How search reads it.** For each of the 20 sichos, it reads the first
  five paragraphs that hold the words, in order, one sicha at a time (a
  `LATERAL … ORDER BY n LIMIT 5` on the primary key). It then picks the best
  of those in code as now. The first matching paragraph is still found, so a
  sicha that opens on the words is still marked as opening. No index on
  `tsv` is needed: the table is only read by sicha, never searched across all
  sichos, which keeps it much smaller.
- **Kept by the database.** The `unit_place` trigger (migration 0030), which
  runs whenever main moves, also rewrites the changed sichos' rows here, so
  nothing that writes the catalog can leave it behind.

It ships in three PRs, in this order:

1. **Migration, alone.** It creates the empty table and the `rights`
   column, and extends the trigger, so new and changed sichos are kept from
   then on. It fills nothing, so the deploy stays short.
2. **A fill job** in services/jobs that fills the rows for the sichos
   already there, a few hundred at a time, each batch in its own
   transaction. It can stop and pick up where it left off. Filling
   `unit_place.lead` in one migration (0034) took 233 s on live, and this
   job reads the same revisions, so it runs as a job, not in a migration.
3. **Search reads it.** `unitRows` reads `unit_text` and `unit_place`, and
   falls back to the revision for a sicha with no rows yet. Until the fill
   job finishes, search works exactly as now. The PR shows EXPLAIN (ANALYZE,
   BUFFERS) before and after for a common, a mid and a rare word, under
   custom and generic plans.

### What it saves (local prototype)

The same 20 sichos per word, on the synthetic catalog. "After" is a
prototype of the read in step 3, with sichos cut into 250-word paragraphs
(about 1.2 KB each, like a printed sicha's):

| word | bodies now | first 5 matching paragraphs |
|---|---|---|
| common (תניא) | 6,918 buffers · 16 ms | 490 buffers · 0.5 ms |
| mid (עעססנ) | 6,915 buffers · 18 ms | 228 buffers · 9 ms |
| rare (עעסהכ) | 6,915 buffers · 15 ms | 190 buffers · 1 ms |

That is 14 to 36 times fewer reads. Reading every matching paragraph
instead of the first five took 15,700 buffers for the common word, more
than the bodies do now, so the limit is what makes this work.

## Cost and risk

- **Work.** Data lane only: the three PRs above, about a day and a half in
  all.
- **Running cost.** No new service and no paid run. The database grows by
  the sichos' words once more, plus a tsvector for each paragraph. On the
  synthetic catalog the table without a words index came to about 0.9 GB
  for 60 MB of revisions. That overstates real text, because the made-up
  words are all different and so compress and index badly. The fill job's
  first batch measures the real growth per sicha, and the job stops before
  filling the rest if the whole would not fit comfortably on the DigitalOcean
  disk. The numbers go to the Director before it goes on.
- **Live risk.** The migration adds an empty table and a column, and changes
  the trigger. A mistake in the trigger would fail every Approve that
  touches a sicha. Its tests run each kind of change (new sicha, edited
  words, rights changed, sicha deleted, moved to another sefer), and it
  ships alone so a revert of the read is never needed. Search falls back to
  the revision for any sicha without rows, so a slow or stopped fill shows
  nothing wrong.
- **Undoing it.** Migrations are never reverted, but step 3 can be reverted
  on its own, and the table then simply goes unread. A later migration can
  drop it.
- **From Shmuly.** His OK for a new read table, as the speed audit asked for
  each read table step by step. Nothing else: no outside service, no
  Cloudflare or DNS change.

## Alternatives

- **Show fewer results (10 instead of 20).** Halves the reads, but the
  Director ruled it out on 2026-10-11: the 20 results stay.
- **Accept about one second cold.** This is the default until Shmuly
  answers. Warm searches already take 0.1 to 0.2 s.
- **Store the body outside `data`, in its own column.** It would still be
  one large value per sicha, read whole, and every reader of a revision
  would change. That is a much larger change for less gain.
- **Keep snippets ready-made per word.** There are too many words, and it
  would not follow edits.
- **Paragraphs with an index on their words, used to find sichos too.** It
  would replace `entity.search_tsv` for sichos, but it needs a large GIN
  index on a small database, and the ranking just got fast without it
  (#206, #215). It can come later on top of this table if it is ever
  needed.
