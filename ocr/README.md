# RebbeHub-OCR

Custom OCR engines trained on old Kehos scans and old Sichos Kodesh hanacha scans — the same approach applied to every PDF in our catalog.

Goal: master our sources completely — layout, headers, text — with near-100% accuracy, feeding precise text into RebbeHub and the Sichos Kodesh app.

Own repo for now; connects to RebbeHub later.

The plan: `docs/plans/ocr-engines.md` (model choice, training data, layout, catalog pipeline).

## Models

| Model | What it reads | Score | State |
|---|---|---|---|
| RebbeHub-kraken-V1 | Likkutei Sichos indexes (maftechos) | | in use |
| RebbeHub-kraken-LS-V1 | Likkutei Sichos body text, new typeface | 99.91% letters, 97.7% lines perfect on 4,500 held-out vol 39 lines | in use |
| RebbeHub-facenet-V2 | which words are set in Miram (bold) | 1,832 / 1,832 words on five checked pages | in use |

Details and every score: `experiments/likkutei-sichos/README.md` and RebbeHub's docs/models.md.
Models are kept in R2 under `models/<name>/`, not in git.
