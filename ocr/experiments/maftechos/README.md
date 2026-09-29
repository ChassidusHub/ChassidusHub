# Experiment: reading the Likkutei Sichos subject indexes

A first, small run of the plan's Reader A (Kraken) on one kind of page: the
two-column subject indexes (מפתח ענינים) of Likkutei Sichos vols 30–39. The
goal is a clickable index, where each entry leads to the page and sicha it
cites, so the score that matters is **page references read right**.

These scans come from the Otzros HaRebbe Drive, not from the Sichos Kodesh
catalog that §4.1 of the plan names as the only source. Shmuly asked for
them; the plan should say so before this grows past an experiment.

## What is here

| File | What it does |
| --- | --- |
| `fetch.sh` | Downloads the scans and the Chabad Library's typed copies into `vols/` (never committed) |
| `cl_truth.py` | Fetches one typed index from the Chabad Library, politely |
| `ocr_index.py` | Page layout (deskew, rules, column split, lines via Tesseract) and the index parser (topics, volumes, page ranges, footers) |
| `build_pairs.py` | Silver line pairs: each scanned line with its stretch of the typed copy, kept only when the two nearly agree (plan §4.3) |
| `train_round.sh` | Fine-tunes Kraken on those pairs |
| `eval_volume.py` | Reads a whole index with Tesseract or a Kraken model and scores topics and page references against the typed copy. Kraken reads; Tesseract's reading of the same line fills in a volume letter or bracket Kraken missed |
| `run_index.py` | Reads every index page of a book with a model and writes its lines and parsed entries |
| `try_page.py` | Prints Kraken and Tesseract side by side, line by line, for a few pages |
| `export_lines.py`, `add_labels.py` | Cut hard lines (bracketed pages, raised-hyphen ranges) from the vols 1–9 index for a person to label; labels stay in `label1_9/`, never committed |
| `short_pairs.py` | Training pairs for headings and number-only lines, which the silver pairs lacked |
| `fetch_anchors.py` | Fetches each sicha's first page and PDF link from mafteiach.app, one request a second |
| `link_typed.py` | Links a volume's index as typed by the Chabad Library (vols 30–39), with no OCR needed |
| `link.py` | Links each page reference to its sicha and the page within that sicha's PDF, or flags it for a person |

`ocr_index.py` expects `tessbest/` beside it, holding the `heb` and `eng`
models from tessdata_best.

## How a round runs

    ./fetch.sh
    python3 build_pairs.py vols/ls30.pdf vols/truth30.json pairs/ls30   # per volume
    ls pairs/ls3{0,1,2,3,5,6,8,9}/*.png > train.txt                    # vol 34 held out
    ./train_round.sh round1 train.txt
    ketos convert -o r1.safetensors round1/ckpt/<best>.ckpt
    python3 eval_volume.py vols/ls34.pdf vols/truth34.json r1.safetensors diffs34.json

Vol 34 is never trained on. It is the test volume, and the scores below
are all on it. The silver pairs train, they never test.

## Results so far (vol 34, 2026-09-29, CPU only)

| Reader | Characters right | Words right | Page refs right |
| --- | --- | --- | --- |
| BiblIA (medieval manuscripts), untrained | 80.5% | 36.5% | not run |
| Tesseract 5, tessdata_best | not run | not run | 593 of 615 (96.4%) |
| Kraken, round 1 (vols 30–33, 3,590 lines) | 99.5% | 98.0% | **612 of 615 (99.5%)** |
| Kraken, round 2 (8 volumes, 8,252 lines) | 99.5% | 97.5% | 604 of 620 (97.4%) before the fixes below |

Characters and words are on 300 held-out lines. Page references cover the
whole vol 34 index: 620 in the typed copy, less 5 numbers that are a stray
timestamp in the library's text.

Round 2 did not beat round 1, so reading had stopped being the problem.
Going through round 1's errors one by one showed where they were:

- page footers ("עסק ... תורה355") read as entries; now dropped;
- headings that lost their colon, or carry a gloss ("כפר חב"ד (ישוב):");
- line boxes from Tesseract that left out a number at the line's start;
  the Kraken reader now boxes all the ink on the line.

What is left on vol 34: one heading the layout step never found as a line
(יחידות), one heading misread (יריחו as יךיחן), and one page "1" in the
typed copy that looks like the library's own error.

## The vols 1–9 index and linking (2026-09-29)

The combined index of vols 1–9 prints marks the typed pairs never had:
bracketed pages ("[857]"), raised-hyphen ranges, footnote marks. 314 of
its lines were labelled by hand and added to training (round 4). Rounds
are chosen by vol 34 page references, not line scores: round 3 scored
better on lines and fell to 493 of 615 references.

| Reader | vols 1–9 hard lines | vols 1–9 random lines | vol 34 page refs |
| --- | --- | --- | --- |
| Kraken, round 1 | 88.1% | 97.97% | 612 of 615 |
| Kraken, round 4 | 97.96% | 98.73% | 610 of 615 |

Linking the vols 1–9 read (4,859 references) to mafteiach.app's 2,229
sicha starts: 4,694 link, 165 (3.4%) are flagged for a person. Most of the
earlier flags came from the column split giving the left column's volume
letters to the right column; it now cuts in the middle of the widest
gutter, and flags fell from 421 to 165. What is left: numbers run together
(for example 44444), a volume letter lost or misread, and vols 5+ whose
end page is a guess (last sicha start + 40).

Vols 30–39 (not 37, which has no typed index yet) come typed from the
Chabad Library, so they link with no OCR: all 6,650 references link. From
vol 35 the library also names its own sicha for each page; 192 references
are marked where it splits finer than mafteiach.app, almost all in the
additions (הוספות), where one PDF holds several talks and letters. The PDF
page is still right there.

All output is machine output, labelled as such until a person checks it.
