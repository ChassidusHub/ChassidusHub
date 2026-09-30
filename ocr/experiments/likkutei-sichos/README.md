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
