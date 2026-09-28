# RebbeHub OCR: the plan

Written 2026-09-28. A plan, not a build. The OCR engine behind RebbeHub's
"machine OCR" text layer (`rebbehub.md` §4, §7, §9) and the Sichos Kodesh
app. It lives in its own repo for now and plugs into RebbeHub's job queue later
as the `services/ml` OCR worker (`rebbehub.md` §10).

## 0. Decisions so far

Taken 2026-09-28, after the first draft. The sections below follow them.

| Question | Decision | Where it lands |
| --- | --- | --- |
| Who annotates | **RebbeHub.org public review.** Community reviewers correct machine OCR line by line ("Fix this line"). Their reviewed lines are the ground truth. No paid typists | §4.4, §10 |
| Digital text for Sichos Kodesh hanachos | **None exists.** Ground truth for hanachos comes only from generic OCR that people have really reviewed | §4.3, §4.4 |
| Digital text for Toras Menachem | Text from **lahak.org** | §4.3 |
| Digital text for old Kehot printings | Text from **chabadlibrary.org** | §4.3 |
| Rights, Sichos Kodesh and old Kehot scans | **Fully safe (100%).** We may train on them, and we may publish the models and datasets | §4.1, §11 |
| Compute | Rent GPUs by the hour. GitHub CI runs tests and evaluation and starts the GPU jobs, but it does not do the heavy work | §6.6 |
| Where scans come from | **Only the Sichos Kodesh catalog** (api.sk.shmuky.dev, catalog 1.7.0). No other source | §4.1, §13 |
| Phase 0 sample | Two sets of 100 PDFs each, pinned in `data/samples/phase0-sample.tsv`: Sichos Kodesh hanachos, and old Kehot (Likkutei Sichos) | §13 |
| Storage | A **separate R2 bucket, `rebbehub-ocr`**, apart from the media-lake bucket | §15 |
| Uploads | **None until the R2 credentials exist.** Everything up to the upload is prepared | §14, §16 |
| GPU | **Runpod** (Community Cloud for the cleared sets). Phase 0 budget **up to $200**, capped by prepaid credit | §6.6, §16 |

## 1. The goal, in numbers

"Near-100%" has to be measurable, or it will slide. We measure on **frozen
test pages from our own sets**, never on generic benchmarks:

| Metric | Target: Kehot print | Target: hanachos (typed/mimeo) |
| --- | --- | --- |
| Character error rate (CER), body text | ≤ 0.1% (≈ 2 errors per page) | ≤ 0.5% |
| CER, footnotes (small type / Rashi script) | ≤ 0.3% | ≤ 1% |
| Region classification (header, body, footnote…) F1 | ≥ 99.5% | ≥ 98% |
| Reading order exactly right, per page | ≥ 99% | ≥ 97% |
| Footnote marker ↔ footnote link accuracy | ≥ 99.5% | ≥ 98% |
| **Auto-accept precision**: errors in lines the system marks "consensus" | ≤ 1 per 10,000 chars | ≤ 1 per 5,000 chars |

The last row matters most. No model will be perfect on every line of a
million pages. The system is built to **know which lines it is sure of**.
Those lines go to checking at low priority. The rest go first to a person,
so the human time goes where the errors are. Everything stays labelled
machine text until a person checks it (`rebbehub.md` §9, "machine drafts,
human truth").

## 2. What we are reading: source families

The catalog is not one problem but a few distinct **families**, each
with its own fonts, layout and damage. Every model decision below is made
per family.

| Family | Examples | Text | Typical difficulty |
| --- | --- | --- | --- |
| **K1 Kehot letterpress / early offset** (5710s–5750s) | Likkutei Sichos, Sefer HaMaamarim, Igros Kodesh, early Toras Menachem | Hebrew square body; footnotes in smaller square or Rashi script; some Yiddish (early LS volumes) | Broken/filled letters, show-through, page curl, tight footnotes in 2–3 columns |
| **K2 Kehot phototypeset / modern** (5750s→) | Later Toras Menachem, Sefer HaSichos, reprints | Clean square + Rashi | Easy text; dense apparatus, many abbreviations (ראה לקו"ש ח"ב ע' …) |
| **H1 Hanachos, typewritten Hebrew** | Sichos Kodesh / hanachos bilti mugah | Hebrew typewriter faces | Mimeo/stencil bleed, faint carbon, overstrikes, hand corrections |
| **H2 Hanachos, typewritten Yiddish** | Yiddish Sichos Kodesh | Yiddish typewriter (אַ אָ װ ײ …) | As H1, plus Yiddish orthography and mixed loshn-koydesh words |
| **M Manuscript / handwritten** | Facsimiles of the Rebbe's ksav yad, hagahos on hanachos | Handwriting | Out of scope now: detected and flagged, not read (`rebbehub.md` §9: "handwriting later") |
| **O Other catalog PDFs** | HebrewBooks scans, kovtzim, yearbooks, teshuros | Everything above plus modern DTP | Onboarded as new families by the recipe in §8 |
| **D Born-digital PDFs** | Most teshuros, newer kovtzim | Embedded text | Often *not an OCR problem*: extract the text layer. Legacy Hebrew fonts give reversed or mis-encoded text, so repair it and check it against a quick OCR pass |

Phase 0 (§10) checks this table against the real catalog. It samples
pages from every set and clusters them by font and layout. A cluster that
fits no family becomes a new one.

## 3. Model choice

### 3.1 The architecture: layout → lines → two independent readers

We do **not** use one end-to-end "page in, text out" model as the source of
truth. We use a classic two-stage pipeline with a second, different model
checking it:

```
page image
  │
  ├─ preprocess (deskew, dewarp, crop, contrast; keep grayscale)
  ├─ LAYOUT: regions (header / body / heading / footnote / …) + text lines
  │          (baselines + polygons) + reading order
  ├─ READER A (primary): line recogniser, CTC, trained per family
  ├─ READER B (checker): fine-tuned vision-language model on the same line crops
  ├─ CONSENSUS: align A vs B per character; agree → "consensus";
  │             disagree → "uncertain" with both readings kept
  ├─ LEXICON FLAGS: words unknown to our Chabad corpus lexicon → flag, never rewrite
  └─ PAGE QA: page number sequence, running header vs catalog, charset, line counts
```

Why this shape:

- **Line positions are a contract.** RebbeHub stores every line's position
  on the page image so search hits light up on the scan (§4). A line-based
  pipeline produces them natively. Page-level VLMs don't produce them
  reliably.
- **No invented text.** A CTC line recogniser can misread a letter, but it
  cannot write a fluent sentence that isn't on the page. Page-level VLMs
  sometimes do exactly that: they skip a line, repeat one, or "correct"
  the Rebbe's wording toward a more common phrase. For the Rebbe's words
  that is the worst possible failure. VLMs are used only as a checker
  (Reader B), on single lines, where a hallucination shows up as a
  disagreement.
- **Two different model types make different mistakes.** When a CTC model
  and a transformer VLM give the same reading, that agreement is strong
  evidence the line is right. This is how the auto-accept precision target
  in §1 is reached.
- **Cheap per-family specialisation.** Line recognisers are small (a few
  million parameters). Fine-tuning one per family takes hours on one GPU,
  and inference runs on CPU if needed.

### 3.2 Reader A: the primary recogniser

**Choice: Kraken** (Apache-2.0).

- Built for right-to-left scripts, with bidi handled correctly. It is
  widely used for Hebrew in digital-humanities projects, and community
  Hebrew print models exist to start from (HTR-United / Zenodo).
- One tool does both baseline and region segmentation (§5) and
  recognition. Kraken reads and writes PAGE-XML and ALTO.
- Lines reviewed on RebbeHub come out as PAGE-XML, which Kraken trains
  from directly. The Phase 0 bridge set (§4.4) uses eScriptorium, which
  belongs to the same ecosystem.
- Model per family: one shared **base Hebrew-print model** trained on
  everything, then fine-tuned heads for K1, K2, H1, H2. A small font
  classifier on each region picks the head. The Rashi script inside
  K1/K2 footnotes gets its own head.

**Challenger, run in the Phase 0 benchmark:** a transformer line
recogniser (a PARSeq/TrOCR-style encoder-decoder, fine-tuned). If it beats
Kraken by a clear margin on a family, it becomes Reader A for that family.
The pipeline treats readers as plug-ins with the same interface.

**Baselines only (to know where we stand):** Tesseract `heb`/`yid`, Surya,
one commercial API (Google Document AI or Azure) as a reference number, and
any Hebrew-specific OCR we can get to run (e.g. Dicta's). Commercial
APIs are not candidates for production. They cost too much at catalog
scale, give no per-family training and create outside dependency.

### 3.3 Reader B: the checker

**Choice: an open vision-language model in the 3B–8B range** (Qwen-VL
family or whatever open model leads on Hebrew in the Phase 0 benchmark),
**LoRA-fine-tuned on our line crops** with the same ground truth as Reader
A.

- Reader B reads single line crops, never whole pages. It is prompted to
  transcribe exactly, with no normalisation.
- It runs on every line during the benchmark and while training (to
  measure agreement). In production it can run on every line or only on
  the lines where Reader A is least confident. The choice depends on GPU
  budget (§6.4).
- It also serves as a **second opinion on hard lines** in the human
  review tool. Both readings are shown and the person picks or types.

### 3.4 Language knowledge: flags, not rewrites

We have a large body of digital Chabad text: the Sichos-Kodesh corpus,
chabadlibrary.org, Sefaria. From it we build:

- a **word/abbreviation lexicon** per language (Hebrew, Yiddish, Aramaic),
  including Chabad-specific abbreviations (לקו"ש, אדה"ז, כ"ק, מוהרש"ב …);
- a **character n-gram model** used only to *re-rank* Reader A's beam
  candidates when the image is truly ambiguous (e.g. ה/ח, ד/ר, ו/ז, ם/ס
  on broken type).

Rule: the language layer **may flag a word or re-rank the recogniser's own
candidates; it may never insert a word the recogniser did not propose.**
The printed page wins, including its typos. Correcting a printer's typo is
an editorial act for a human, recorded as such.

## 4. Training data pipeline

### 4.1 Collecting scans

- **Inventory**: scans come **only from the Sichos Kodesh catalog**
  (§0, §13). Each catalog PDF entry has a `driveFileId`, which is fetched
  through the catalog's media proxy. Output is one manifest row per scan
  (§14): sha256, set, catalog reference, source URL, rights state, page
  count and image details.
- **Fetch originals**, never re-encoded copies. Pull the embedded page
  images with `pdfimages` at native resolution instead of re-rendering.
  Store by sha256 (same scheme as RebbeHub R2 `objects/<sha256>`).
- **Rights**: Sichos Kodesh and old Kehot scans are cleared (§0). We
  train on them, and their models and datasets can be published. Any
  other set is trained from private, `preserved`-tier copies
  (`rebbehub.md` §8) until its rights are settled. Every model records
  which sets it was trained on, so we always know whether it can be
  published.
- **Stratify, don't just take the first N**: sample pages across set ×
  decade × printer × scan source × scan quality. Include bad pages on
  purpose: stains, curl, faint mimeo, crooked scans.

### 4.2 Transcription guidelines (written first, before any labelling)

Consistent ground truth matters more than the choice of model. One short
document, `gt/guidelines.md`, decides every character question once:

- **Diplomatic transcription**: exactly what is printed. Keep printer
  typos and the printed spelling. Don't expand abbreviations, and don't
  add or remove nikkud.
- **Character table** (with Unicode codepoints): gershayim `״` vs `"`,
  geresh `׳` vs `'`, maqaf `־`, final letters, Yiddish ligatures `װ ױ ײ`
  and `ײַ`, pasekh-alef `אַ`, komets-alef `אָ`, rafe, parentheses and
  brackets in RTL, footnote markers (numbers, Hebrew letters, `*`).
  The rule is **store what is printed, in normalised Unicode** (NFC, fixed
  mark order), with one mapping table to RebbeHub's search normalisation
  (`normalizeSearchText`).
- **Layout marks**: every line belongs to a region with a type (§5).
  Footnote markers are tagged as markers.
- **Hanachos**: typed text vs handwritten corrections are separate layers.
  Overstrikes record the final reading plus an "overstrike" flag.
- **Unreadable**: a fixed placeholder (e.g. `⸢…⸣`) with a flag, never a
  guess.
- Every tenth page is transcribed twice by different people. Agreement
  between them is tracked. Pages where they disagree get a ruling that is
  added to the guidelines.

### 4.3 Silver ground truth: use the text we already have

This is the biggest lever for the Kehot printings. Aligning digital text
we already have to the scans gives thousands of labelled lines almost for
free. The sources are fixed (§0):

| Scans | Digital text aligned against | Silver? |
| --- | --- | --- |
| Old Kehot printings (Likkutei Sichos, Sefer HaMaamarim, Igros Kodesh …) | chabadlibrary.org | Yes |
| Toras Menachem | lahak.org | Yes |
| Sichos Kodesh hanachos | none | **No.** Hanachos get only reviewed gold (§4.4) |

The steps:

1. Run a baseline model (pretrained Kraken) on the scan to get lines and
   rough text.
2. Align the page's rough OCR to the matching stretch of digital text:
   locate it with anchored fuzzy matching, then align character by
   character (edlib / Needleman-Wunsch).
3. Keep a line as **silver** only if every difference is one the baseline
   OCR plausibly made (low CER, confusable letter pairs). Throw away any
   line where the digital edition *differs from the printing*. Digital
   texts are often re-edited, with corrected typos, expanded
   abbreviations, changed punctuation or moved footnotes. Silver must
   describe the printed page, not the digital edition.
4. People spot-check a random 2% of silver lines. If they find errors
   above 0.2%, the filter is tightened.

Silver trains the models. **Silver never goes into test sets.**

### 4.4 Gold ground truth: RebbeHub.org public review

Annotation happens on RebbeHub.org through its normal review flow. The
community reviews the text: "Fix this line", proofread levels, and
Projects (`rebbehub.md` §4, §7). Nobody is paid to type.

- **What counts as gold.** Proofread levels become the ground-truth grade:
  - a line *checked once* (one reviewer) can be used for **training**;
  - a line *checked twice* by two different reviewers can be used for
    **test sets**.

  Where the two reviewers disagree, the disagreement is resolved by a
  keeper and recorded as a ruling in the guidelines (§4.2). That gives us
  the double-checking for free.
- **The rules have to be in the tool.** Reviewers will only transcribe
  diplomatically if the tool keeps them to it. RebbeHub's line editor
  shows the rule ("type exactly what is printed, typos included") and
  offers a palette of the table's characters (gershayim, geresh, maqaf,
  Yiddish ligatures). It also warns when someone types a look-alike, such
  as `"` instead of `״`. This is a requirement for RebbeHub, recorded here.
- **Layout** (region types, missing or merged lines) is harder for the
  public to fix. Reviewers get a one-tap "layout is wrong here" report,
  and keepers fix it in a simple region editor. We need about 100–300
  layout-checked pages per family, so this is keeper work, not crowd work.
- **Projects, not random pages.** Training needs come in as RebbeHub
  Projects, such as "Proofread Sichos Kodesh 5722 for the OCR". The
  **active-learning** queue picks the pages: those the current models find
  hardest (lowest confidence, most A/B disagreement, most lexicon flags).
  Pages the model already reads perfectly are not sent to people.
- **Targets per family**: about 300–500 training pages *checked once* and
  a frozen **test set of ~100 pages** *checked twice*. Test pages come from
  whole volumes that are never trained on. Hold out volumes, not random
  lines, so the score isn't inflated by pages the model has seen.

**Sichos Kodesh hanachos: the flywheel.** No digital text exists, so we
start from generic OCR and let each round of review make the next round
easier:

1. **Round 0**: the best off-the-shelf engine from the Phase 0 benchmark
   (§3.2) OCRs the hanachos. It goes up on RebbeHub labelled as
   machine text.
2. Reviewers correct the first ~100 pages chosen by active learning. Those
   corrections train the first H1/H2 models.
3. Pages nobody has reviewed yet are re-OCRed with the better model.
   Reviewed lines are never touched (§6.5). There are fewer errors left to
   fix, so reviewing goes faster.
4. Repeat. Each round should need fewer corrections per page, and the
   corrections-per-page number is tracked as the sign that the flywheel is
   working.

**Before RebbeHub's text tools exist**: Phase 0 needs test pages before
RebbeHub phase 4 ships "Fix this line". Keepers produce this first,
small set (about 100 pages per family) in a self-hosted eScriptorium
using the same guidelines. It is a bridge only. All later annotation
happens on RebbeHub.org.

### 4.5 Synthetic data (support only)

We render lines from our digital corpus in fonts close to the printed ones
(Hebrew typefaces similar to Kehot's, typewriter faces). Then we add damage:
ink spread, broken type, mimeo bleed, blur, skew and noise. The use is
**rare characters and abbreviations** that real pages have too few
examples of. Synthetic data is never more than about 30% of any training
mix and never in test sets.

### 4.6 Data versioning

Every dataset is a manifest of (image sha256, region/line id, text,
source: silver/gold/synthetic, annotator, guideline version). The manifest
itself is hashed. Every model records the hash of the dataset manifest it
was trained on, so any output line can be traced to the model and data
behind it.

## 5. Layout handling

### 5.1 Region types

| Region | Goes to | Notes |
| --- | --- | --- |
| `running-header` | metadata, not text | Set / parsha / volume. Checked against the catalog |
| `page-number` | metadata | Hebrew-letter or Arabic numerals. Must form a sequence |
| `heading` / `subheading` | text, marks structure | Sicha/maamar titles, section heads. Proposes unit boundaries |
| `body` | main text stream | Single or multi-column |
| `footnote` | footnote stream | Often 2–3 columns, smaller type or Rashi script |
| `footnote-continuation` | joins the previous page's footnote | Common in Likkutei Sichos |
| `marginal` / `source-ref` | attached to the nearest body line | Side notes, source references |
| `toc` / `index` | structured tables | Front and back matter |
| `figure` / `facsimile` | image, flagged | Ksav yad facsimiles are family M and are not read yet |
| `handwritten-note` | separate layer | Hagahos on hanachos |
| `stamp` / `library-mark` / `noise` | dropped | Kept in PAGE-XML, never in text |

### 5.2 How it works

- **Lines**: Kraken's baseline segmenter, fine-tuned on our gold pages.
  Baselines + polygons per line.
- **Regions**: a region detector (Kraken region segmentation, or a
  YOLO/DETR-class detector if the benchmark shows it is clearly better),
  trained on the region types above.
- **Page templates per set**: each set's pages are very regular. Running
  heads sit in the same place, footnotes are divided off by a rule and
  columns keep the same widths. From the gold pages we learn a template
  per set and printing, and use it two ways: as a prior (it corrects
  borderline region calls) and as an **anomaly detector** (a page that
  doesn't fit its template goes to review).
- **Reading order**: right-to-left and top-to-bottom, column by column,
  and body before footnotes. Rules plus the set template handle most
  pages. Pages that break the template are flagged, not guessed.
- **Footnotes**: markers in the body text are found (superscripts, Hebrew
  letters, `*`) and matched to footnote labels by number and sequence.
  A footnote that continues past the page is joined to the next page's
  `footnote-continuation`. Numbering must be continuous within a unit, and
  any gap is flagged.
- **Across pages**: paragraphs that cross a page break are joined when the
  unit text is assembled. Running heads and page numbers are removed from
  the text stream but kept with their positions.
- **Structure → catalog**: headings plus running heads suggest unit
  boundaries ("sicha 3 starts on p. 14") and contents-map entries
  (`rebbehub.md` §4). The OCR bot proposes them as suggestions, never
  merges them.

## 6. Running the whole catalog

### 6.1 Stages

Each stage is an idempotent job keyed by
`(scan sha256, page, stage, model version)`, so re-running is safe and
cheap:

```
ingest → triage → render → preprocess → classify → layout → read A → read B
       → consensus + flags → page QA → assemble → export
```

- **triage**: born-digital or scanned? A born-digital PDF (family D)
  takes the text-extraction path. That means repairing legacy Hebrew
  encodings and fixing reversed text, then comparing the result with a
  quick OCR pass. It falls back to OCR if they disagree.
- **classify**: set/family (from the catalog when known, otherwise from
  the font/layout classifier), plus a scan-quality score.
- **page QA** (automatic, per page): page numbers in sequence; running
  header matches the catalog's set/volume/parsha; only expected
  characters; line count within the template's range; footnote numbering
  continuous. A failed check is a flag shown to reviewers, never a silent
  fix.

### 6.2 Orchestration

- **Now (own repo):** a Python package (`rebbeocr`) with one CLI command
  per stage and a SQLite job/manifest database. It runs on a single GPU
  machine or rented GPUs. No cluster, no framework to maintain.
- **Later (inside RebbeHub):** the same stage functions run in the Python
  worker container that takes jobs from RebbeHub's queue
  (`rebbehub.md` §10). The SQLite manifest is replaced by RebbeHub's
  `file`/`derivation` tables. Only the adapter changes; the stages don't.

### 6.3 Order of work

Sets are processed in order of value and of how much ground truth exists:

1. **Likkutei Sichos**: the most digital text for silver GT and the most
   cited set. This proves the K1 pipeline.
2. **Sichos Kodesh hanachos** (H1/H2): the main need for the Sichos
   Kodesh app.
3. Toras Menachem, Sefer HaMaamarim, Igros Kodesh (K1/K2).
4. Everything else, set by set, onboarding each new family (§8).

### 6.4 Throughput and cost (estimate; Phase 0 measures it)

- Layout + Reader A: well under a second per page on one GPU. Reader A
  also runs on CPU.
- Reader B (VLM) is the expensive part. On every line it adds several
  seconds per page. On only Reader A's lowest-confidence ~15% of lines it
  adds a fraction of that.
- About a million pages then takes days to a few weeks on 1–4 rented GPUs.
  That fits `rebbehub.md` §10's "GPU rented only while a project runs".
  Phase 0 replaces these guesses with measured numbers and a price. §6.6
  gives the costs.

### 6.5 Model lifecycle

- **Registry**: every model has a name, version, dataset-manifest hash and
  eval scores. The text layer records exactly which models produced each
  page (`rebbehub.md` §9: "engine and version stored with each layer").
- **Deploy gate**: a new model ships only if it is **no worse on any
  family's frozen test set** and better on at least one. The eval suite
  runs in CI on a small frozen subset for every PR.
- **Re-OCR**: when a better model ships, pages are re-run in priority
  order. Only lines no person has checked are replaced. Human-checked
  lines are locked (§7). The change is recorded as a diff, so we can see
  what the new model changed.
- **Feedback loop**: reviewed lines from RebbeHub.org (and the Phase 0
  eScriptorium bridge set) are gathered into gold lines. The models are
  retrained periodically, and the active-learning queue (§4.4) is
  refreshed.
- **Drift watch**: flag rates and A/B disagreement are tracked per set and
  per scan source. A new scanner or a new printing shows up as a jump, and
  gets gold pages before its output is trusted.

### 6.6 Compute: where it runs and what it costs

**Decision: Runpod, rented by the hour**, only while a training run or a
catalog batch is going. Nothing sits idle.

**Runpod on-demand prices** (runpod.io/pricing, checked 2026-09-28):

| GPU | Community Cloud | Secure Cloud | Good for |
| --- | --- | --- | --- |
| RTX 4090 (24 GB) | $0.34 / h | $0.74 / h | Kraken training, layout, Reader A, benchmarks |
| RTX 5090 (32 GB) | $0.69 / h | $0.99 / h | The same, faster; a small (3B) Reader B |
| L40S (48 GB) | $0.79 / h | $1.09 / h | Running Reader B at 7–8B, bigger batches |
| A100 80 GB PCIe | $1.19 / h | $1.59 / h | **Fine-tuning Reader B**, 30B-class models zero-shot |
| A100 80 GB SXM | $1.39 / h | $1.59 / h | The same, faster between GPUs |
| H100 PCIe / SXM (80 GB) | $1.99 / $2.69 per h | $2.89 / $3.49 per h | The largest models, short runs |

Storage: network volume $0.07/GB-month, container disk $0.10/GB-month.

**Why Runpod.** Vast.ai is a marketplace and can be cheaper: a 4090 is
typically about $0.39/h and can go as low as $0.14/h, an A100 80 GB is
from about $1.09/h, and interruptible instances are 30–50% cheaper still.
But hosts vary in quality and reliability. Runpod has fixed prices, an
API, an official MCP server and agent tooling, and prepaid credit that
works as a hard spending cap. Nothing in the research argues for a
different primary provider.

**How it is used:**
- **Community Cloud** for the cleared sets (Sichos Kodesh, old Kehot).
  **Secure Cloud** for anything not yet cleared.
- Data lives in R2 (§15). A small network volume (~100 GB, ~$7/month)
  holds only model weights and caches, so pods can be thrown away.
- Every pod is stopped when its job ends. Jobs write their results and
  checkpoints to R2 before exiting.

**Phase 0 budget: up to $200.** This is enough to test heavy models, not
just small ones:

| Phase 0 work | GPU | Hours | Cost |
| --- | --- | --- | --- |
| Engine benchmark (Kraken, Surya, docTR-class, Tesseract as a baseline) on the test pages | RTX 4090, Community | ~20 | ~$7 |
| Zero-shot open VLMs (7–8B and 30B-class) as Reader B candidates | A100 80 GB PCIe, Community | ~25 | ~$30 |
| Kraken line and layout fine-tune pilots (K1, H1) | RTX 4090 | ~30 | ~$10 |
| **LoRA fine-tune pilots for Reader B** (several model sizes and configs; the heavy part) | A100 80 GB | ~60 | ~$72–84 |
| One large-model check (a 70B-class VLM zero-shot on the hardest lines) | H100 SXM, Community | ~10 | ~$27 |
| Network volume, 2 months | — | — | ~$14 |
| Reserve for reruns | | | ~$30–40 |
| **Total** | | | **≈ $200** |

**Bigger runs later:** Runpod stays the default.
- Fine-tuning runs on A100 or H100 SXM pods.
- If a run needs more than one GPU, it uses Runpod Instant Clusters.
- Bulk catalog OCR can resume after interruption, so it can move to
  Vast.ai interruptible 4090s if a measured run shows it is clearly
  cheaper.

What each job costs later (estimates; Phase 0 measures the real numbers):

| Job | GPU time | Cost |
| --- | --- | --- |
| Fine-tune one Kraken head (one family) | 2–6 h on a 4090 | ~$1–5 |
| Fine-tune the layout model (one family) | 4–12 h on a 4090 | ~$2–10 |
| LoRA fine-tune of the Reader B VLM (7B, ~50k lines) | 4–10 h on an A100/H100 | ~$10–30 |
| **OCR 1 million pages**, Reader B on the hardest ~15% of lines | ~150–250 h on 4090-class | **~$60–200** |
| OCR 1 million pages, Reader B on every line | ~350–450 h | ~$150–400 |
| **First year in total** (training rounds, re-OCR, benchmarks) | | **~$500–1,500** |

Compute is cheap. People's time reviewing is the real cost, and every
choice in §4 is aimed at spending less of it.

**Owning a machine instead**: one 24–32 GB GPU workstation costs about
$2,500–4,000, plus power and upkeep. At the rates above, it pays for
itself only after several thousand GPU-hours, which is years of our
expected use. It also cannot scale out for a catalog run. Rent. Look again
only if retraining becomes a continuous, daily job.

**Can it run on GitHub CI?** Partly:

| Use | GitHub Actions? | Why |
| --- | --- | --- |
| Unit tests, format checks (PAGE-XML, ALTO, text-layer JSON) | **Yes** | Standard runners. Free and unlimited for a public repo, and 2,000 free minutes a month for a private one |
| Evaluation gate on a small frozen test subset (§6.5) | **Yes** | Kraken runs on CPU, so layout + Reader A on ~50 pages fits in a normal job. This makes the no-regression rule automatic on every PR |
| Starting a training run or a catalog batch | **Yes, as the button** | A `workflow_dispatch` job calls the Runpod API with the `RUNPOD_API_KEY` secret (§16). The job runs on the rented GPU and writes results to object storage. The workflow waits and posts the scores |
| Training models | **No** | Standard runners have no GPU and a 6-hour job limit. GitHub's GPU runners (T4) are only for paid Team/Enterprise plans, at about $0.07/minute (~$4/hour). That is several times the price of a rented 4090, on a slower card |
| Reader B (VLM) | **No** | Needs a GPU |
| OCR of the whole catalog | **No** | Too slow on CPU, and runners have little disk. GitHub's terms also limit Actions to building, testing and deploying the repo's own software, so running a bulk OCR farm there could get the account suspended |

So GitHub CI is the control panel and the quality gate. The heavy work
runs on rented GPUs that CI starts and stops.

## 7. Output: meeting RebbeHub's contracts

**Archival format: PAGE-XML** per page, the full record. It holds regions
with types, line polygons and baselines, reading order, both readers' text,
per-character confidences and flags. It is lossless, a standard, and
what Kraken/eScriptorium speak natively. **ALTO** is exported alongside
for IIIF and library viewers (`rebbehub.md` §8).

**RebbeHub text layer (JSON, per scan page):**

```json
{
  "scan": "<sha256>", "page": 14,
  "layer": "machine-ocr",
  "engine": { "name": "rebbeocr", "version": "0.3.0",
              "models": { "layout": "k1-layout@2.1#<hash>",
                          "readerA": "k1-body@4.0#<hash>",
                          "readerB": "vlm-lines@1.2#<hash>" } },
  "regions": [ { "id": "r1", "type": "running-header", "polygon": [...] } ],
  "lines": [
    { "id": "p14-l003", "region": "r2", "polygon": [...], "baseline": [...],
      "text": "…", "confidence": 0.998,
      "status": "consensus",
      "flags": [],
      "alt": null }
  ],
  "readingOrder": ["r2", "r3", "r5"],
  "footnoteLinks": [ { "marker": "p14-l007:23", "footnote": "p14-l031" } ],
  "qa": { "pageNumber": "יד", "headerMatchesCatalog": true }
}
```

| RebbeHub contract | How the OCR satisfies it |
| --- | --- |
| Text layer per scan, page by page, each line's position (§4) | `lines[].polygon/baseline` in page-image pixels |
| Machine OCR records engine + version (§4, §9) | `engine` block with model ids and dataset hashes |
| Re-OCR without touching human-checked lines (§9) | Stable line ids from geometry. Re-OCR replaces only lines no person has checked |
| Community text seeded from the best OCR (§4, §7) | Keepers choose the layer. `status` is carried over so reviewers start with the `uncertain` lines |
| Proofread levels raw → checked once → twice (§4) | Unchanged. `consensus`/`uncertain` are *machine* hints that sort the queue. They never count as a check |
| Unit texts with stable segment ids, Markdown with anchors (§4, §6) | The `assemble` stage builds the body and footnote streams by unit and exports Markdown with footnotes. RebbeHub assigns the segment ids |
| Machine text labelled until checked (§9, §14) | `layer: machine-ocr` on every line. Nothing is promoted automatically |
| Contents maps and unit boundaries (§4, §7 "Map a teshura") | Heading/running-head detection produces *suggestions* from the OCR bot |
| Python ML workers behind the queue, GPU burst (§10) | §6.2 |

## 8. Onboarding a new family (repeatable recipe)

Used for every new family found in the catalog (HebrewBooks prints,
kovtzim, yearbooks, teshuros):

1. The family shows up as a cluster in classify (§6.1) or as a spike in
   flags (§6.5).
2. Sample about 150 pages across its volumes. Pre-OCR them with the
   closest existing heads.
3. Silver GT (§4.3) if digital text exists. Gold for about 100 pages of
   training and 50 frozen test pages, with active learning choosing them.
4. Fine-tune a layout template and a recogniser head from the base model.
5. Check it against §1's targets on the family's test set. Once it passes,
   add it to the router and run the family.

Target: a new family goes from discovery to production in **1–2 weeks**,
mostly annotation time.

## 9. Repo layout (when building starts)

```
rebbeocr/            Python package: stages, readers (plug-in interface), CLI
  stages/            ingest, triage, render, preprocess, classify, layout,
                     read, consensus, qa, assemble, export
  readers/           kraken, vlm, (challengers)
  formats/           page-xml, alto, rebbehub-json
gt/guidelines.md     transcription rules + character table
data/manifests/      dataset manifests (hashed); images live in object storage
eval/                frozen test-set manifests, metrics, benchmark reports
models/registry.json model versions, dataset hashes, scores
deploy/              eScriptorium + worker containers
```

Python managed with `uv`, tested with `pytest`. The eval suite runs in CI.

## 10. Roadmap

| Phase | What it delivers | Exit criterion | Size |
| --- | --- | --- | --- |
| **0. Survey & benchmark** | Catalog inventory and family clustering; `gt/guidelines.md`; eScriptorium bridge (§4.4) with keepers making ~100 test pages each for K1 and H1/H2; benchmark of every candidate in §3 on them, including speed and cost | A results table and the engine choices confirmed or changed. Nothing is trained on the test pages | 3 weeks |
| **1. Kehot print (K1/K2)** | Silver GT aligned against chabadlibrary.org (old Kehot) and lahak.org (Toras Menachem); gold from RebbeHub review once it is live; fine-tuned layout + Reader A; page templates; footnote linking | §1 targets met on K1/K2 frozen tests; all of Likkutei Sichos run | 5 weeks |
| **2. Hanachos (H1/H2)** | Generic OCR up on RebbeHub; flywheel rounds of public review → retrain → re-OCR (§4.4); handwritten-correction layer detected | §1 hanacha targets met; corrections per page falling round on round | 5 weeks of work, then paced by review volume |
| **3. Second reader & scale** | Reader B fine-tuned; consensus; lexicon flags; page QA; full stage pipeline with idempotent jobs; registry + deploy gate | Auto-accept precision target met; a 10,000-page batch runs unattended with a flag report | 4 weeks |
| **4. Whole catalog** | Onboarding recipe run for each new family; born-digital path; priority queue across sets | Every scan in the catalog has a machine-OCR layer or a stated reason why not | ongoing |
| **5. RebbeHub integration** | Queue worker adapter; text-layer JSON into RebbeHub; "Fix this line" corrections feed back into training | Lines corrected in RebbeHub show up in the next training run | with RebbeHub phase 4 |

## 11. Risks

- **VLM invents text**: Reader B only checks single lines. It is never the
  only source of a line, and disagreements go to a person.
- **Silver GT copies the digital edition instead of the printing**: strict
  alignment filter, human spot checks, and silver kept out of every test set.
- **Inconsistent ground truth**: guidelines written first, 10% double
  transcription, and rulings recorded.
- **Overfitting to one scanner or printing**: test sets hold out whole
  volumes and scan sources, and drift is watched (§6.5).
- **Yiddish orthography and nikkud**: diplomatic rules and a fixed Unicode
  table. Search normalisation happens later, in RebbeHub, not in OCR.
- **Rights for training material**: Sichos Kodesh and old Kehot are
  cleared (§0). Other sets train from private preserved-tier copies, and
  models trained on them wait for clearance. The registry records the sets
  behind each model.
- **Review pace is not in our hands**: hanachos have no silver text, so
  they move only as fast as public review. Mitigations: Projects with clear
  goals, active learning so every reviewed line teaches the model
  something, and the flywheel so each page takes less fixing.
- **Dependency on RebbeHub**: gold annotation needs RebbeHub's text tools
  (its phase 4). The eScriptorium bridge covers only the Phase 0 test pages.
- **Annotation effort is the real cost** (compute is ~$500–1,500 a year,
  §6.6): silver GT, active learning and the flywheel keep human hours for
  the hard lines.
- **Lossy JBIG2 compression in the scans**: the catalog PDFs are bitonal
  JBIG2, and some were compressed with CVISION PdfCompressor. Its lossy
  mode can swap look-alike glyphs (for example ה/ח or ו/ז) inside the image
  itself. Ground truth always follows the image. Where the image itself is
  ambiguous, it is marked `⸢…⸣`, never guessed. Affected files are
  reported to the catalog owners so a better scan can be found.
- **The catalog holds excerpts, not whole volumes**: each PDF is the few
  pages of one occasion. That is fine for test pages. Learning a per-set
  page template (§5.2) may need more consecutive pages later.
- **One-person project**: everything in open formats (PAGE-XML, ALTO,
  manifests). Models are reproducible from registry + manifests.

## 12. Open questions

The ones answered on 2026-09-28 are in §0. Still open:

- **R2 jurisdiction**: is the `rebbehub-ocr` bucket in the default
  location or in the EU jurisdiction? This decides whether `R2_ENDPOINT`
  is needed (§16).
- **Runpod key permissions**: confirm that the key can create and stop
  pods and nothing wider (§16).

- **Toras Menachem rights**: may models and datasets trained on TM scans and
  lahak.org text be published, or do they stay internal?
- **RebbeHub requirements**: the line editor rules and character palette,
  and the keeper region editor (§4.4). Add them to RebbeHub's phase 4.
- **Nikkud and editorial marks**: confirm "diplomatic, as printed" as the
  rule for every set.
- **Handwriting (family M)**: when it becomes its own project, for the
  Rebbe's ksav yad and hagahos.

## 13. Phase 0 sample sets (pinned)

Scans come only from the Sichos Kodesh catalog (§0).

**The catalog**

| What | Where |
| --- | --- |
| API index | `https://api.sk.shmuky.dev/`. Source: `shmuky/Sichos-Kodesh/services/catalog-api` |
| Release manifest | `GET https://api.sk.shmuky.dev/v3/catalog/manifest.json` |
| **Pinned catalog** | `GET https://api.sk.shmuky.dev/v3/catalog/1.7.0/catalog.json`: 11,484,299 bytes, sha256 `9818f542dfd18fc76433901cb51b2e5d7300fae4f5eac33bbe246720815a96e8` |
| PDF entries | `byYear[<year>][i].pdfs[j]` = `{section, label, driveFileId, resourceKey?}`. `section` is one of `mugah`, `biltiMugah`, `maamorim`, `hagahos`, `hosofos` (`packages/catalog/src/types.ts`) |
| How a PDF is fetched | The catalog's own media proxy: `https://sichos-kodesh-media-proxy.shmuky.workers.dev/drive/<driveFileId>[?resourcekey=<resourceKey>]`. It wraps `https://drive.google.com/uc?export=download&id=<driveFileId>[&resourcekey=…]` and handles Drive's confirm step for large files (`services/media-proxy/src/index.ts`) |

**The two sets**

| Set | Rule on catalog 1.7.0 | Size in the catalog | Sample |
| --- | --- | --- | --- |
| **A: Sichos Kodesh hanachos** (`A-sk-hanachos`) | `section == "biltiMugah"`, the label matches `שיחו"ק` or `שיחות קודש`, and the label does not contain `תו"מ` (Toras Menachem is a different family) | 2,413 entries, 2,380 unique files, years 5710–5752 | 100 |
| **B: old Kehot, Likkutei Sichos pages** (`B-old-kehot-ls`) | `section == "mugah"`, and the label names a Likkutei Sichos volume (`^ח"<vol> ע'` or `לקו"ש`) | 830 entries, 554 unique files, years 5710–5750. Mostly volumes 1–10, some 20 and 30 | 100 |

**Selection** (deterministic, and the same TSV comes out every time):

1. Take every PDF entry on catalog 1.7.0 that matches the set's rule.
2. Remove duplicates by `driveFileId`, keeping the earliest occasion.
3. Group the files: Set A by `hebrewYear` (43 years), Set B by Likkutei
   Sichos volume, read from the label.
4. Within each group, sort the files by `sha256(driveFileId)` in hex.
5. Pick 100 files:
   - **Set A**: go round the years in order, taking the next file from
     each, until there are 100 (2–3 per year).
   - **Set B**: split 100 between the volumes in proportion to their size.
     Every volume gets at least 3 files, or all its files if it has fewer.
     The largest volumes are trimmed or topped up until the total is
     exactly 100.
6. Write the result to **`data/samples/phase0-sample.tsv`**: 200 rows,
   with no duplicate `driveFileId`.

Columns: `set, stratum, occasionId, hebrewYear, hebrewDate, section,
label, driveFileId, resourceKey, proxyUrl, driveUrl`.

**What the files look like.** One file from each set was checked, and six
more URLs were spot-checked; all returned `200 application/pdf`. They are
real scans: bitonal JBIG2 page images, a few pages per occasion.
- Sichos Kodesh: 2560×3300 px (300 dpi, letter size). Compressed with
  CVISION PdfCompressor, and it appears to carry a hidden text layer. That
  text layer is a candidate "generic OCR" baseline for §4.4's round 0.
- Likkutei Sichos: about 1736×2674 px (about 250 dpi).

Two consequences:
- The scans have no grayscale to keep, so preprocessing works on
  bitonal images.
- Lossy JBIG2 can swap look-alike glyphs. This is added to the risks
  (§11).

## 14. Download-and-manifest workflow (specified, not yet run)

1. **Read** `data/samples/phase0-sample.tsv`.
2. **Fetch** each `proxyUrl` with a plain GET.
   - At most 2 downloads at a time, about 1 request per second.
   - Exponential backoff on 429 and 5xx responses.
   - Fall back to `driveUrl` only if the proxy keeps failing. It is the
     same catalog file, not a new source.
3. **Check** that the response starts with `%PDF` and is not empty.
   Anything else is logged as a failure and not retried with guesses.
4. **Store** the file as `work/raw/pdf/<sha256>.pdf`. If two catalog
   entries turn out to be the same file (same sha256), they share one copy
   and the manifest records both references.
5. **Inspect** each PDF:
   - page count and producer;
   - for every page image: width, height, filter (JBIG2, CCITT, JPEG…)
     and bits per pixel;
   - whether a text layer exists. If it does, extract it as a candidate
     baseline.
6. **Write one manifest row per PDF** to
   `work/manifests/scans/<date>-phase0.jsonl`:
   ```json
   { "sha256": "…", "bytes": 59944, "set": "A-sk-hanachos",
     "catalog": { "version": "1.7.0", "sha256": "9818f542…", "occasionId": 11113350,
                  "hebrewDate": "5720-10-28", "section": "biltiMugah", "label": "שיחו\"ק" },
     "source":  { "driveFileId": "…", "resourceKey": null, "proxyUrl": "…", "driveUrl": "…",
                  "fetchedAt": "…", "etag": "…" },
     "pdf":     { "pages": 3, "producer": "CVISION …", "textLayer": true,
                  "images": [ { "page": 1, "w": 2560, "h": 3300, "filter": "JBIG2Decode", "bpc": 1 } ] },
     "rights":  "cleared 2026-09-28 (Sichos Kodesh / old Kehot)" }
   ```
7. **Upload gate.** The upload runs only when the R2 secrets in §16 are
   present. Without them the workflow stops after step 6 and says so.
   - Files are uploaded to the layout in §15 with `If-None-Match: *`, so
     a raw file is never overwritten.
   - The sha256 is stored as object metadata (`x-amz-meta-sha256`).
   - Each upload is checked with a HEAD request against the local sha256
     and size.
   - The manifest and the TSV are uploaded last, so a manifest never
     points at a missing object.

## 15. R2 bucket `rebbehub-ocr`

This is a separate bucket for training data, apart from the media-lake
bucket that RebbeHub serves from. It is private, with no public access.

```
rebbehub-ocr/
  raw/pdf/<sha256>.pdf                              original PDFs, byte-identical, write-once
  raw/pages/<sha256>/<page:04d>.<ext>               page images extracted at native resolution (pdfimages)
  manifests/scans/<YYYY-MM-DD>-<name>.jsonl         scan manifests (§14)
  manifests/samples/phase0-sample.tsv               the pinned sample list (copy of the repo file)
  manifests/datasets/<dataset-id>.jsonl             training/test datasets (§4.6)
  manifests/datasets/<dataset-id>.sha256            the hash every model records
  annotations/gold/<guideline-ver>/<sha256>/<page:04d>.xml       reviewed ground truth (PAGE-XML)
  annotations/silver/<guideline-ver>/<sha256>/<page:04d>.xml     aligned silver lines
  annotations/synthetic/<batch-id>/…                rendered training lines
  checkpoints/<model>/<version>/…                   model weights
  checkpoints/<model>/<version>/card.json           dataset hash, training sets, scores, rights
  eval/<run-id>/                                    benchmark and evaluation reports
  tmp/                                              scratch space, deleted after 7 days by a lifecycle rule
```

Rules:
- `raw/` is write-once.
- `annotations/` is versioned by guideline version, so a change to the
  rules never silently rewrites old ground truth.
- A checkpoint is complete only once its `card.json` exists.

## 16. Access needed (one-step handover)

All secrets go into **this cloud environment's settings** as environment
variables: the environment menu in the session title bar → Edit. They are
never pasted into chat. A new session picks them up. The same names are
used for GitHub Actions secrets later.

**R2 (needed before any upload)**
1. Confirm the bucket name: **`rebbehub-ocr`**.
2. In Cloudflare, create an R2 API token with the permission **Object
   Read & Write**, applied **to the `rebbehub-ocr` bucket only**. That
   gives an Access Key ID and a Secret Access Key.
3. Set these variables:

| Variable | Value | Required |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account ID | yes |
| `R2_ACCESS_KEY_ID` | the token's Access Key ID | yes |
| `R2_SECRET_ACCESS_KEY` | the token's Secret Access Key | yes |
| `R2_BUCKET` | `rebbehub-ocr` | no (this is the default) |
| `R2_ENDPOINT` | full S3 endpoint URL | only if the bucket uses the EU jurisdiction |

The workflow uses the S3-compatible API with endpoint
`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, or `R2_ENDPOINT` if it
is set, and region `auto`.

**Runpod**
- **The Runpod MCP** (installed 2026-09-28 as the `runpod@runpod` plugin)
  signs in with OAuth through `/mcp` → runpod → "Sign in with Runpod". It
  needs no key.
- **Scripts and GitHub CI** need an API key:
  - create it in the Runpod console under Settings → API Keys;
  - give it the narrowest permission that can create and stop pods;
  - store it as **`RUNPOD_API_KEY`**.
- **Spending cap**: load up to **$200 of prepaid credit** and turn
  auto-reload off. The balance is then a hard cap. No job can spend past
  it.
