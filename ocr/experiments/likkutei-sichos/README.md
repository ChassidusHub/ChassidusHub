# Likkutei Sichos body text

Reading the body of Likkutei Sichos (the sichos and their footnotes, not
the indexes) into paragraphs with linked footnotes and the printed page
numbers kept, as RebbeHub page text. Machine output stays labelled until a
person checks it.

Typed text to learn from exists only for vols 30–39 (the Chabad Library,
a page per printed page, page-aligned with the scans). Vols 1–29 have
scans only; they are read by the model this trains. Every volume is the
same typeface (vols 1–4 set a little wider, 5–9 and 10 on alike), two
columns with the footnotes under a short rule in each column.

Steps, run from a working folder outside git (scans and texts never go in git):

1. `fetch.py <Sichos-Kodesh checkout>`: the vol 30–39 scans, a PDF per sicha.
2. `truth.py`: the Chabad Library crawl (`/mnt/project-files/chabadlibrary`) as a file per printed page.
3. `ocr_all.py <model> <worker> <of>`: each page's lines found (`layout.py`: ink
   profiles, no learned segmenter) and read by the current model.
   One torch thread per worker; four workers on four cores.
4. `pairs.py [out]`: each read line found in its page's typed text; where they
   nearly agree the typed words, written as printed (`14)` for a footnote mark,
   `„` for an opening quote, `-` where a word breaks at the line end), are its label.
5. `train.sh <name> <train list> <validation list>`: fine-tune from
   RebbeHub-kraken-V1 (the maftechos model). Vols 30–38 train, vol 39 tests.
6. `assemble.py <vol>_<start page>`: a sicha's lines back into paragraphs and
   notes (page text JSON, and a plain view to check by eye).

`show.py` draws a page's layout (body lines red, footnote lines blue).

## Models and scores (2026-10-02)

Scored on 4,500 lines of vol 39 that no model trained on. "Lines perfect" means the
whole line was read with no mistake at all. The full tables, every save of every run,
are in RebbeHub's docs/models.md.

| Model | Letters right | Words right | Lines perfect | State |
|---|---|---|---|---|
| Base PP-OCRv6 (start) | 96.45% | 86.39% | | history |
| Stage 2, main best (run 2) | 99.82% | 99.41% | 96.1% | superseded |
| **Focus drill, RebbeHub-kraken-LS-V1** | **99.91%** | **99.68%** | **97.7%** | **in use** |
| Run 3, 128 px, best save | 99.87% | 99.51% | 97.0% | not better |

Miram (this print's bold) is found by a separate small net, facenet2.py
(RebbeHub-facenet-V2): 1,832 of 1,832 words agree with Shmuly's eye on five pages.

Vols 15–29 have no typed text, so their quality is estimated, not measured:
`weakspots.py` checks every read word against the library's vocabulary and the
reader's own confidence. On vols 15–17 most sichos are Yiddish, and the reader is
about twice as unsure there as on Hebrew (2.8% of words below 0.9 confidence, against
1.2%), because only about 5% of its training lines were Yiddish.

## More steps

7. `readsicha.py <model> --out <dir> <pdf>…`: a sicha PDF through the whole chain
   (layout, reading, stars from the ink, the font stage, assembly); `gpu/run_read.sh`
   runs it on a rented GPU over whole volumes.
8. `weakspots.py <vocab> <dir>…`: where the reader is weak on volumes without typed text.
9. `yidpairs.py` and `yidtext.py`: Yiddish training lines, from the lines the reader
   read sure and from the Whisper transcripts set in LS spelling (for `gen.py`);
   `gpu/run_yid.sh` fine-tunes on them with a share of the Hebrew lines kept in.
