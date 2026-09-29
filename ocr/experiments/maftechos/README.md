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
| `eval_volume.py` | Reads a whole index with Tesseract or a Kraken model and scores topics and page references against the typed copy |

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

All output is machine output, labelled as such until a person checks it.
