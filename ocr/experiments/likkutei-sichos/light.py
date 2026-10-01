"""Letters of the light face (Miram) cut from scans of the new typeface.
Likkutei Sichos sets its stressed words, or part of a word, in Miram,
lighter than the body's Frank, so letters clearly thinner than the same
letters elsewhere on the page are Miram.
Reads the first-pass OCR (ocr/*.json) for the lines and, given pairs.py's
output, the typed text for their letters; a word is kept only
where its ink splits into as many letters as were read.

    python3 light.py <pdf dir> <ocr dir> <out.pkl> [pairs dir] [--regular]"""
import glob, io, json, os, pickle, re, sys
import numpy as np
import pymupdf
from PIL import Image
from skimage.morphology import skeletonize
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from layout import deskew, scan
from harvest import groups, visual

HEB = re.compile(r'^[א-ת]+$')
VOCAB = set(re.findall(r'[א-ת]+', open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'texts_30_38.txt')).read()))


def thickness(lab, g):
    glyph = np.isin(lab[g['y0']:g['y1'], g['x0']:g['x1']], g['ids'])
    sk = skeletonize(glyph).sum()
    return glyph, glyph.sum(), max(1, sk)


def line_words(a, l):
    """(word, [(glyph, area, skeleton, group)], base, xh) per word of a body line
    whose ink could be split to match what was read."""
    h, w = a.shape
    text = l['text'].strip()
    words = visual(text).split()
    chars = [c for c in ''.join(words)]
    band = a[max(0, l['y0'] - 4):min(h, l['y1'] + 4), max(0, l['x0'] - 4):min(w, l['x1'] + 4)] < 128
    gs, marks, info = groups(band)
    if not info or not words:
        return []
    lab, base, xh = info
    spans = []
    if len(gs) == len(chars):
        k = 0
        for wd in words:
            spans.append((wd, gs[k:k + len(wd)])); k += len(wd)
    elif len(gs) > len(words) > 1:
        gaps = [gs[i]['x0'] - gs[i + 1]['x1'] for i in range(len(gs) - 1)]
        cut = sorted(range(len(gaps)), key=lambda i: -gaps[i])[:len(words) - 1]
        if min(gaps[i] for i in cut) > 2 * max(1, np.median(gaps)):
            bounds = [0] + sorted(i + 1 for i in cut) + [len(gs)]
            for wd, (a0, a1) in zip(words, zip(bounds, bounds[1:])):
                if a1 - a0 == len(wd):
                    spans.append((wd, gs[a0:a1]))
    out = []
    for wd, g in spans:
        out.append((wd, [thickness(lab, x) + (x,) for x in g], base, xh))
    return out


def thin_runs(wd, ratios, cut=0.8):
    """Stretches of a word set in Miram: two or more letters in a row thinner
    than the same letters elsewhere on the page. A word can be only partly
    Miram (often its first ה or ו is not), so this goes letter by letter; a
    single thin letter alone is not trusted, as a worn letter can print thin."""
    runs, i = [], 0
    while i < len(wd):
        if ratios[i] < cut:
            j = i
            while j < len(wd) and ratios[j] < cut:
                j += 1
            if j - i >= 2:
                runs.append((i, j))
            i = j
        else:
            i += 1
    return runs


def labels(pairs_dir):
    """The typed text of each body line, from pairs.py's report and log:
    {(stem, pdf page, 'b' or 'n'): [(ocr text, label or None)]}, in reading order
    (pairs.py leaves out lines too short to place). Light words are the
    ones the first-pass model reads worst, and a misread that is still a real
    word (מזה read as חוה) would put the wrong letter in the font, so the
    letters are named from the typed text, never from the OCR."""
    out = {}
    for log in glob.glob(f'{pairs_dir}/log_*.txt'):
        vol = log.rsplit('_', 1)[1][:-4]
        if not os.path.exists(f'{pairs_dir}/{vol}/report.jsonl'):
            continue
        rep = {}
        for l in open(f'{pairs_dir}/{vol}/report.jsonl'):
            r = json.loads(l)
            rep[r['name']] = r
        for l in open(log):
            m = re.match(r'(\d+_\d+) (\d+) -> (\d+) ', l)
            if not m:
                continue
            stem, p, page = m.group(1), int(m.group(2)), int(m.group(3))
            for kind in 'bn':
                ls, i = [], 0
                while (r := rep.get(f'{vol}_{page:04d}_{kind}{i:02d}')):
                    ls.append((r['ocr'], r['label'] if r['score'] >= 80 else None))
                    i += 1
                out[(stem, p, kind)] = ls
    return out


CAP = 3000  # copies kept per regular letter: plenty for an average, and the store stays small
DIGITS = re.compile(r'^[()\[\]*]*\d+[.,;:()\[\]]*$')  # a number, maybe in brackets or before a stop


def page(a, lay, store, stats, texts=None, regular=False):
    """Light (Miram) letters from one page: body lines as 'L:', footnote lines
    as 'nL:' (smaller; starred notes are set wholly in Miram). Each letter's
    stroke is measured against the median of the same letter in the same
    place on the page (nearly all Frank), and stretches of thin letters kept
    by thin_runs(). A word not found in the typed text of vols 30-38 is left
    out.

    With regular=True it collects the Frank letters instead ('F:', 'nF:'):
    whole words whose every letter is of ordinary thickness, and numbers
    (the font's digits, from body and footnotes only, never running heads)."""
    n = 0
    for key, kind, prefix in (('body', 'b', 'L:'), ('notes', 'n', 'nL:')):
        if regular:
            prefix = prefix.replace('L', 'F')
        lines = [l for col in lay[key] for l in col]
        if texts is not None:
            named, k, typed = [], 0, texts.get(kind, [])
            for l in lines:
                if k < len(typed) and typed[k][0] == l['text']:
                    if typed[k][1]:
                        named.append(dict(l, text=typed[k][1]))
                    k += 1
            lines = named
        ws = []
        for l in lines:
            ws += [w for w in line_words(a, l) if (HEB.match(w[0]) and w[0] in VOCAB) or (regular and DIGITS.match(w[0]))]
        per = {}
        for wd, gl, base, xh in ws:
            for ch, x in zip(wd, gl):
                per.setdefault(ch, []).append(x[1] / x[2])
        med = {ch: float(np.median(v)) for ch, v in per.items() if len(v) >= 5}
        for wd, gl, base, xh in ws:
            if regular and DIGITS.match(wd):
                for ch, (glyph, area, sk, g) in zip(wd, gl):
                    if ch.isdigit():
                        store.setdefault(prefix + ch, []).append({'img': np.packbits(glyph), 'shape': glyph.shape, 'top': g['y0'] - base, 'xh': base - xh})
                continue
            if not all(ch in med for ch in wd):
                continue
            ratios = [x[1] / x[2] / med[ch] for ch, x in zip(wd, gl)]
            stats.extend(ratios)
            if regular:
                if all(0.88 <= r <= 1.15 for r in ratios) and any(len(store.get(prefix + ch, [])) < CAP for ch in wd):
                    for ch, (glyph, area, sk, g) in zip(wd, gl):
                        if len(store.get(prefix + ch, [])) < CAP:
                            store.setdefault(prefix + ch, []).append({'img': np.packbits(glyph), 'shape': glyph.shape, 'top': g['y0'] - base, 'xh': base - xh})
                continue
            for i, j in thin_runs(wd, ratios):
                n += 1
                store.setdefault('_words', []).append((prefix, wd, i, j))
                for ch, (glyph, area, sk, g) in zip(wd[i:j], gl[i:j]):
                    store.setdefault(prefix + ch, []).append({'img': np.packbits(glyph), 'shape': glyph.shape, 'top': g['y0'] - base, 'xh': base - xh})
    return n


def _norm(glyph, n=32):
    ys, xs = np.nonzero(glyph)
    if not len(ys):
        return None
    g = glyph[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    v = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BILINEAR), float)
    v -= v.mean()
    return v / (np.linalg.norm(v) or 1)


def _rendered(ch, font_path, cache={}):
    from PIL import ImageDraw, ImageFont
    if (ch, font_path) not in cache:
        f = ImageFont.truetype(font_path, 120)
        im = Image.new('L', (200, 200), 0)
        ImageDraw.Draw(im).text((40, 20), ch, font=f, fill=255)
        cache[ch, font_path] = _norm(np.asarray(im) > 127)
    return cache[ch, font_path]


def looks_miram(ch, sample, miram, frank, floor=0.5):
    """A cut letter is kept as Miram only if its shape is closer to Shmuly's
    Miram outline of that letter than to the Frank one, and close enough to be
    that letter at all: a thin letter that is really Frank, or a letter named
    wrong, falls out here."""
    glyph = np.unpackbits(sample['img'])[:np.prod(sample['shape'])].reshape(sample['shape'])
    v = _norm(glyph)
    if v is None:
        return False, 0, 0
    m, f = float((v * _rendered(ch, miram)).sum()), float((v * _rendered(ch, frank)).sum())
    return m > f and m > floor, m, f


if __name__ == '__main__':
    regular = '--regular' in sys.argv
    args = [x for x in sys.argv[1:] if x != '--regular']
    pdfs, ocr, out = args[:3]
    typed = labels(args[3]) if len(args) > 3 else None
    store = pickle.load(open(out, 'rb')) if os.path.exists(out) else {}
    stats = []
    for f in sorted(glob.glob(f'{pdfs}/*.pdf')):
        stem = os.path.basename(f)[:-4]
        if f in store.get('_done', []) or not os.path.exists(f'{ocr}/{stem}.done'):
            continue
        if stem.startswith('39_'):  # vol 39 is the test set: no letters from it in the fonts
            continue
        d = pymupdf.open(f)
        for p in range(len(d)):
            j = f'{ocr}/{stem}_{p:02d}.json'
            if not os.path.exists(j) or (typed is not None and (stem, p, 'b') not in typed):
                continue
            a = deskew(scan(d, p))
            page(a, json.load(open(j)), store, stats, {k: typed.get((stem, p, k), []) for k in 'bn'} if typed is not None else None, regular)
        store.setdefault('_done', []).append(f)
        print(stem, len(store.get('_words', [])), 'light runs', sum(len(v) for k, v in store.items() if not k.startswith('_')), 'letters', flush=True)
        pickle.dump(store, open(out + '.tmp', 'wb'))
        os.replace(out + '.tmp', out)
