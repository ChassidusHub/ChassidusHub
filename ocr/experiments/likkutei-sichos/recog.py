"""Read a page's lines with a Kraken model: the first pass that silver
pairs are built from, and later the trained model's output."""
import re, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from kraken.configs import RecognitionInferenceConfig
from kraken.containers import Segmentation, BBoxLine
from kraken.tasks import RecognitionTaskModel
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from layout import deskew, page_layout, runs
from postfix import tidy

PAD = 6
FACE_ON, FACE_OFF = '\ue000', '\ue001'  # around letters set in Miram, in a line's text (assemble.runs reads them)


# READ_DEVICE=cuda puts the reading on the GPU (a pod); the page's own work (layout,
# stars, faces) stays on the CPU either way.
import os
CONFIG = RecognitionInferenceConfig(text_direction='horizontal-rl', num_line_workers=0,
                                    accelerator='gpu' if os.environ.get('READ_DEVICE', '').startswith('cuda') else 'cpu')


def load(path):
    return RecognitionTaskModel.load_model(path)


def read_page(net, a):
    """The page's layout with 'text' filled in on every line."""
    lay = page_layout(a)
    # The running head too, read on every page: it can change within a sicha.
    lines = [l for key in ('body', 'notes') for col in lay[key] for l in col] + [lay['head']] + lay.get('headings', [])
    h, w = a.shape
    seg = Segmentation(type='bbox', imagename='page', text_direction='horizontal-rl', script_detection=False,
                       lines=[BBoxLine(id=str(i), bbox=(max(0, l['x0'] - PAD), max(0, l['y0'] - PAD), min(w, l['x1'] + PAD), min(h, l['y1'] + PAD)), text_direction='horizontal-rl')
                              for i, l in enumerate(lines)])
    recs = list(net.predict(Image.fromarray(a), seg, CONFIG))
    if SECOND:
        recs = vote_lines(a, seg, lines, recs, len([l for col in lay['body'] for l in col]))
    for l, rec in zip(lines, recs):
        l['text'] = rec.prediction.strip()
        l['words'] = words(rec, l)
        l['marks'] = marks(rec, l)
    stars(net, a, lines, recs)
    for col in lay['notes']:
        for l in col:
            note_label(net, a, l)
    faces(a, lay)
    # The font stage proper (facepage: a net over each word's letters, matched to
    # Shmuly's eye on five pages) replaces the thickness reading when its model is here.
    try:
        import facepage
        facepage.run(a, lay)
    except Exception as e:
        print('font stage skipped:', e, file=sys.stderr)
    for l in lines:  # marks the print sets one way (". . .", "word* next", no space before ":")
        l['text'] = tidy(l['text'])
    return lay


# A second reader (round 3, 2026-10-02) reads every line again and the word check
# picks between the two (vote.Chooser). Which one goes first matters, since a tie keeps
# it: the round 3 reader on the body of a Yiddish page (63 mistakes in 2,500 Yiddish
# test lines against the keeper's 215), the keeper everywhere else (Hebrew, and the
# notes of a Yiddish sicha, where the round 3 reader drops dashes and points).
SECOND, CHOOSER = None, None
YIDDISH = {'איז', 'דער', 'ניט', 'אויף', 'וואס', 'זיך', 'דאס', 'אויך', 'נישט', 'מען', 'זיין', 'פון', 'מיט', 'ווי', 'אז', 'האט', 'ווערט', 'וועגן'}


def use_second(path, vocab, lm=None):
    global SECOND, CHOOSER
    import vote
    SECOND, CHOOSER = load(path), vote.Chooser(vocab, lm)


def vote_lines(a, seg, lines, recs, nbody):
    """Each line's reading after the vote; a line the two read differently keeps the
    other reading in 'alt' (and 'reader': 2 when the round 3 reader's was taken)."""
    recs2 = list(SECOND.predict(Image.fromarray(a), seg, CONFIG))
    words = [w for r in recs[:nbody] for w in r.prediction.split()]
    yiddish = len(words) > 0 and sum(w in YIDDISH for w in words) / len(words) > 0.08
    out = []
    for i, (l, r1, r2) in enumerate(zip(lines, recs, recs2)):
        first, second = (r2, r1) if yiddish and i < nbody else (r1, r2)
        which, _ = CHOOSER.pick(first.prediction.strip(), second.prediction.strip())
        took, other = (second, first) if which else (first, second)
        if took.prediction.strip() != other.prediction.strip():
            l['alt'] = other.prediction.strip()
            if took is r2:
                l['reader'] = 2
        out.append(took)
    return out


def note_label(net, a, line):
    """A note line read as opening with a bare ")" lost its number (the model drops
    small raised digits now and then: 1,058 typed notes had the same gap): the
    line's first stretch is read by itself, where a short crop usually gives the
    number. One width is not enough (2026-10-04: the same label read "(8", "(",
    "8) צע" at 1.6, 2.2 and 4 line heights), so five widths are read and the
    label most of them give is taken. A lone label often comes out mirrored
    ("(1" for 1), as the net has seen a bracket before a digit only in "(ח, טו)"."""
    import collections
    text = line.get('text', '')
    if not re.match(r'^\*{0,3}\)', text):
        return
    h = line['y1'] - line['y0']
    seen = collections.Counter()
    for k in (1.2, 1.6, 2.2, 3, 4):
        crop = a[max(0, line['y0'] - PAD):line['y1'] + PAD, max(0, int(line['x1'] - k * h)):line['x1'] + PAD]
        m = re.match(r'^\(?(\*{0,3})(\d{1,3})[()]?(\*{0,3})', read_crop(net, crop).strip())
        if m:
            seen[(m.group(1) or m.group(3)) + m.group(2)] += 1
    if seen:
        label = seen.most_common(1)[0][0]
        line['text'] = label + text.lstrip('*')
        line['label_from_crop'] = label
        line['marks'] = sorted(line.get('marks', []) + [{'label': label, 'x0': int(line['x1'] - 1.2 * h), 'x1': int(line['x1'])}], key=lambda x: -x['x1'])


def keeps(base, new):
    """True when the reading without the blob lost nothing of the reading with it:
    taking a yod or a quote away loses it; taking a star away loses nothing (and may
    even let the model read the bracket after it)."""
    import difflib
    return all(op[0] in ('equal', 'insert') for op in difflib.SequenceMatcher(None, base, new).get_opcodes())


def read_crop(net, crop):
    h, w = crop.shape
    seg = Segmentation(type='bbox', imagename='line', text_direction='horizontal-rl', script_detection=False,
                       lines=[BBoxLine(id='0', bbox=(0, 0, w, h), text_direction='horizontal-rl')])
    return next(iter(net.predict(Image.fromarray(crop), seg, CONFIG))).prediction


def stars(net, a, lines, recs):
    """Raised stars the model left out, confirmed by reading again without them:
    the candidate blobs are whitened and the lines read once more, all in one
    pass; a line whose reading lost nothing had no letter in those blobs (a yod
    is as small and as high as a star, but whitening it loses it from the
    reading), so they are stars the model dropped, and go into the text. A line
    that did lose something has its blobs tried one at a time."""
    cands = [(l, rec, star_blobs(a, l)) for l, rec in zip(lines, recs)]
    cands = [c for c in cands if c[2]]
    if not cands:
        return
    h, w = a.shape
    white = a.copy()
    for l, rec, groups in cands:
        for g in groups:
            for ys, xs in g[3]:
                white[ys, xs] = 255
    seg = Segmentation(type='bbox', imagename='page', text_direction='horizontal-rl', script_detection=False,
                       lines=[BBoxLine(id=str(i), bbox=(max(0, l['x0'] - PAD), max(0, l['y0'] - PAD), min(w, l['x1'] + PAD), min(h, l['y1'] + PAD)), text_direction='horizontal-rl')
                              for i, (l, rec, groups) in enumerate(cands)])
    again = [r.prediction for r in net.predict(Image.fromarray(white), seg, CONFIG)]
    for (l, rec, groups), new in zip(cands, again):
        if keeps(rec.prediction, new):
            sure = groups
        else:
            y0, y1, x0, x1 = max(0, l['y0'] - PAD), min(h, l['y1'] + PAD), max(0, l['x0'] - PAD), min(w, l['x1'] + PAD)
            crop = a[y0:y1, x0:x1]
            base = read_crop(net, crop)
            sure = []
            for g in groups:
                c = crop.copy()
                for ys, xs in g[3]:
                    c[ys - y0, xs - x0] = 255
                if keeps(base, read_crop(net, c)):
                    sure.append(g)
        if sure:
            add_stars(a, l, rec, sure)


def star_blobs(a, line):
    """Raised stars in a line, by their ink: small round blobs in the top half
    of the line, clear of the letters, grouped when side by side (** is two).
    [x0, x1, count, pixels] right to left, in page coordinates. (The model drops a
    bare star more often than not: only 95 of 35,397 training note lines held
    one, so the mark is taken from the ink, not from the reading.)"""
    y0, y1, x0, x1 = line['y0'], line['y1'], line['x0'], line['x1']
    h = y1 - y0
    band = a[max(0, y0 - 2):y1 + 2, max(0, x0 - 2):x1 + 2] < 128
    lab, n = ndimage.label(band)
    found = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        bh, bw = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        area = int((lab[sl] == i).sum())
        top, bottom = sl[0].start - 2, sl[0].stop - 2  # relative to the line's y0
        if not (8 <= area and 0.12 * h <= bw <= 0.6 * h and bh <= 0.6 * h and 0.75 <= bw / max(1, bh) <= 1.35):  # round: a geresh is a short upright stroke
            continue
        if top > 0.3 * h or bottom > 0.62 * h:  # a star hangs from the letters' top, above their middle
            continue
        # a star stands in a gap: no other ink in its columns (a piece broken off the
        # top of a ש, or of a thin bracket, has the rest of its letter under it)
        cols = band[:, sl[1]].sum() - area
        if cols > 2:
            continue
        # a mark follows a word: a word gap (0.3 h of white) lies just left of it,
        # at most a thin bracket between; a yod inside a word (a Miram yod is as
        # small as a star, and the model reads it from the word even when it is
        # whitened) has only letter gaps around it
        gl = sl[1].start
        left = band[:, max(0, gl - int(0.8 * h)):gl].any(0)
        at_edge = sl[1].stop >= band.shape[1] - 0.5 * h - 2 or gl <= 0.5 * h + 2
        if not at_edge and not runs(~left, int(0.3 * h)):
            continue
        ys, xs = np.nonzero(lab[sl] == i)
        pix = (ys + sl[0].start + max(0, y0 - 2), xs + sl[1].start + max(0, x0 - 2))  # on the page
        found.append((x0 - 2 + sl[1].start, x0 - 2 + sl[1].stop, pix))
    found.sort(key=lambda b: -b[1])
    groups = []  # [x0, x1, count, [pixels of each star]]
    for b in found:
        if groups and groups[-1][0] - b[1] < 0.5 * h:
            groups[-1] = [b[0], groups[-1][1], groups[-1][2] + 1, groups[-1][3] + [b[2]]]
        else:
            groups.append([b[0], b[1], 1, [b[2]]])
    return groups


HEB = re.compile('[א-ת]')


def add_stars(a, line, rec, groups):
    """Put the stars the ink shows into the line's text and marks where the model
    left them out: a note's own opening *) or **), or a raised mark after a word.
    groups: the star blobs confirmed by stars()."""
    pred = rec.prediction
    xs, half = letter_xs(rec, line)
    if xs is None or not pred:
        return
    inserts = []  # (index into pred, stars, x0, x1)
    for gx0, gx1, k, _ in groups:
        gc = (gx0 + gx1) / 2
        h = line['y1'] - line['y0']
        if gx1 >= line['x1'] - 0.5 * h:
            i = 0  # the stars open the line: a note's own *)
        else:
            i = next((j for j in range(len(pred)) if xs[j] < gc), len(pred))  # before the first letter left of the stars
            if 0 < i < len(pred) and HEB.match(pred[i - 1]) and HEB.match(pred[i]):
                # the blob sits over a word's middle (a speck, a serif): a raised star
                # always follows a word's last letter, so this is no star (it split
                # שלמים and אין on vol 33 p. 64 and 68, Shmuly 2026-10-02)
                continue
        inserts.append((i, '*' * k, int(gx0), int(gx1)))
    if not inserts:
        return
    out, pos, added = [], 0, []
    for i, stars, gx0, gx1 in sorted(inserts):
        out.append(pred[pos:i])
        m = re.match(r'(\d{0,3})\)', pred[i:])
        if m:  # the note's own label, *) or *14): the number and bracket are read
            out.append(stars)
            label = stars + m.group(1)
        else:  # a raised mark after a word: word*) and a space
            out.append(stars + ')' + ('' if pred[i:i + 1] in ('', ' ') else ' '))
            label = stars
        added.append({'label': label, 'x0': gx0, 'x1': gx1})
        pos = i
    out.append(pred[pos:])
    line['text'] = ''.join(out).strip()
    line['stars_from_ink'] = [m['label'] for m in added]
    line['marks'] = sorted(line.get('marks', []) + added, key=lambda m: -m['x1'])


def faces(a, lay):
    """Miram, the light face, on each word: each letter's stroke measured against
    the same letter's median on the page (body and notes apart, the notes being
    smaller), and a run of two or more thin letters marked as Miram on the word,
    as 'face': [[first letter, after last]] in the word's own letters. (A single
    thin letter is not trusted: a worn letter prints thin too.)"""
    try:
        from light import line_words, thin_runs, HEB
    except Exception:
        return
    for key in ('body', 'notes'):
        lines = [l for col in lay[key] for l in col if l.get('text')]
        per_line, per = [], {}
        for l in lines:
            try:
                ws = line_words(a, l)
            except Exception:
                ws = []
            per_line.append(ws)
            for wd, gl, base, xh in ws:
                if HEB.match(wd):
                    for ch, x in zip(wd, gl):
                        per.setdefault(ch, []).append(x[1] / x[2])
        med = {ch: float(np.median(v)) for ch, v in per.items() if len(v) >= 5}
        wt = [word_thick(a, l, w) for l in lines for w in l.get('words', []) if re.fullmatch(r'[א-ת]{2,}', w['text'])]
        word_med = float(np.median(wt)) if len(wt) >= 20 else None
        hs = [l['y1'] - l['y0'] for l in lines]
        for l, ws in zip(lines, per_line):
            if l['y1'] - l['y0'] < 0.85 * np.median(hs):
                continue  # a smaller face (a date line) prints thinner all over; not Miram
            if len(ws) != len(l.get('words', [])):
                # line_words keeps only the words whose ink split into their letters: match by text
                by_text = {}
                for w in ws:
                    by_text.setdefault(w[0], []).append(w)
                ws = [by_text[visual_word(w['text'])].pop(0) if by_text.get(visual_word(w['text'])) else None for w in l.get('words', [])]
            tokens, t = l['text'].split(' '), 0
            for word, w in zip(l.get('words', []), ws):
                if w is None or not HEB.match(w[0]) or not all(ch in med for ch in w[0]):
                    # the ink did not split into the word's letters (letters touching):
                    # the whole word's stroke against the page's words
                    if word_med and re.fullmatch(r'[א-ת]{2,}', word['text']) and word_thick(a, l, word) < 0.82 * word_med:
                        word['face'] = [[0, len(word['text'])]]
                        runs = word['face']
                    else:
                        continue
                else:
                    ratios = [x[1] / x[2] / med[ch] for ch, x in zip(w[0], w[1])]
                    runs = thin_runs(w[0], ratios)
                if not runs:
                    continue
                word['face'] = [[i, j] for i, j in runs]
                # the same stretches marked in the line's text, for the page text (assemble.runs)
                k = next((k for k in range(t, len(tokens)) if tokens[k] == word['text']), None)
                if k is not None:
                    tok = tokens[k]
                    for i, j in reversed(runs):
                        tok = tok[:i] + FACE_ON + tok[i:j] + FACE_OFF + tok[j:]
                    tokens[k] = tok; t = k + 1
            l['text'] = ' '.join(tokens)


def word_thick(a, l, w):
    """Stroke thickness (ink / skeleton length) of a word's place in its line."""
    from skimage.morphology import skeletonize
    band = a[l['y0']:l['y1'], max(0, w['x0']):w['x1']] < 128
    return band.sum() / max(1, skeletonize(band).sum())


def visual_word(t):
    from harvest import visual
    return visual(t)


MARK = re.compile(r'(\*{1,3}\d{0,3}|\d{1,3})\)')


def marks(rec, line):
    """Each note mark the model read in the line (the raised 14) after a word, or
    the 14) opening a note), with the place of its own letters on the page."""
    pred = rec.prediction
    xs, half = letter_xs(rec, line)
    if xs is None:
        return []
    return [{'label': m.group(1), 'x0': int(max(line['x0'], min(xs[m.start():m.end()]) - half)),
             'x1': int(min(line['x1'], max(xs[m.start():m.end()]) + half))} for m in MARK.finditer(pred)]


def letter_xs(rec, line):
    """The centre of each read letter on the page. The network emits a letter about
    a letter and a half after seeing it, so the frames lag leftwards at the line's
    start (28 px on vol 39) and sit at the ink at its end: the frame positions are
    stretched so the first letter's centre is half a letter in from the right edge
    and the last half a letter in from the left."""
    pred, cuts = rec.prediction, rec.cuts
    if not pred or len(cuts) != len(pred):
        return None, 0
    xs = np.array([sum(p[0] for p in c) / len(c) for c in cuts], float)
    half = (line['x1'] - line['x0']) / max(1, len(pred)) / 2
    lo, hi = xs.min(), xs.max()
    if hi - lo > 2 * half:
        xs = (line['x1'] - half) - (hi - xs) * (line['x1'] - line['x0'] - 2 * half) / (hi - lo)
    return xs, half


def words(rec, line):
    """Each word of a read line with its place on the page (x0, x1 across the line's
    height) and how sure the model was of it (its least sure letter), for showing a word
    on the scan, highlighting a search hit, and sending doubtful words to be checked."""
    pred, conf = rec.prediction, rec.confidences
    xs, half = letter_xs(rec, line)
    if xs is None:
        return []
    out, cur = [], []
    for i, ch in enumerate(pred + ' '):
        if ch == ' ' or i == len(pred):
            if cur:
                out.append({'text': ''.join(pred[j] for j in cur),
                            'x0': int(max(line['x0'], min(xs[j] for j in cur) - half)),
                            'x1': int(min(line['x1'], max(xs[j] for j in cur) + half)),
                            'conf': round(float(min(conf[j] for j in cur)), 3),
                            # each letter's centre, for cutting the word's letters apart (facepage)
                            'xs': [int(xs[j]) for j in cur]})
            cur = []
        else:
            cur.append(i)
    return out


if __name__ == '__main__':
    import time
    net = load(sys.argv[1])
    for f in sys.argv[2:]:
        t = time.time()
        lay = read_page(net, deskew(np.array(Image.open(f).convert('L'))))
        print(f, round(time.time() - t, 1), 's')
        for key in ('body', 'notes'):
            for col in lay[key]:
                for l in col[:4]:
                    print(key, l['text'])
