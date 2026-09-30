"""Letters cut from scans of the old typeface (vols 1-14), to build a font
of it: each body line is read, its ink split into letters (pieces that
overlap across the line joined, as ה's leg to its roof; points under the
line kept apart), and where the letters counted match the letters read,
each is saved with its place against the line's baseline.

    python3 harvest.py <model> <pdf dir> <out.npz-dir>"""
import glob, io, json, os, re, sys
import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from layout import deskew, page_layout
from recog import load, CONFIG
from kraken.containers import Segmentation, BBoxLine


MIRROR = str.maketrans('()[]', ')(][')


def visual(text):
    """The letters of an RTL line as they stand from right to left: a number
    runs left to right, so its digits are reversed; a bracket is drawn
    mirrored, so it is stored as the shape it shows."""
    return re.sub(r'\d+', lambda m: m.group()[::-1], text).translate(MIRROR)


def groups(band):
    """Ink pieces of a line crop, joined into letters, right to left, and the baseline."""
    lab, n = ndimage.label(band)
    objs = ndimage.find_objects(lab)
    comps = []
    for i, sl in enumerate(objs, 1):
        area = int((lab[sl] == i).sum())
        if area < 6:
            continue
        comps.append({'y0': sl[0].start, 'y1': sl[0].stop, 'x0': sl[1].start, 'x1': sl[1].stop, 'ids': [i]})
    if not comps:
        return [], [], None
    hs = np.array([c['y1'] - c['y0'] for c in comps])
    big = [c for c in comps if c['y1'] - c['y0'] >= 0.6 * np.median(hs)]
    base = int(np.median([c['y1'] for c in big]))
    xh = int(np.median([c['y0'] for c in big]))
    marks = [c for c in comps if c['y0'] >= base - 2]
    rest = [c for c in comps if c['y0'] < base - 2]
    rest.sort(key=lambda c: -c['x1'])
    out = []
    for c in rest:
        if out:
            p = out[-1]
            ov = min(p['x1'], c['x1']) - max(p['x0'], c['x0'])
            if ov > 0.5 * min(p['x1'] - p['x0'], c['x1'] - c['x0']):
                p.update(x0=min(p['x0'], c['x0']), x1=max(p['x1'], c['x1']), y0=min(p['y0'], c['y0']), y1=max(p['y1'], c['y1']), ids=p['ids'] + c['ids'])
                continue
        out.append(dict(c))
    return out, marks, (lab, base, xh)


def harvest(net, a, store):
    lay = page_layout(a)
    lines = [l for col in lay['body'] for l in col]
    if not lines:
        return 0
    h, w = a.shape
    seg = Segmentation(type='bbox', imagename='p', text_direction='horizontal-rl', script_detection=False,
                       lines=[BBoxLine(id=str(i), bbox=(max(0, l['x0'] - 6), max(0, l['y0'] - 6), min(w, l['x1'] + 6), min(h, l['y1'] + 6)), text_direction='horizontal-rl') for i, l in enumerate(lines)])
    kept = 0
    for l, rec in zip(lines, net.predict(Image.fromarray(a), seg, CONFIG)):
        text = rec.prediction.strip()
        if not text or min(rec.confidences or [0]) < 0.9:
            continue
        chars = [ch for ch in visual(text) if not ch.isspace()]
        y0, y1 = max(0, l['y0'] - 4), min(h, l['y1'] + 4)
        band = a[y0:y1, max(0, l['x0'] - 4):min(w, l['x1'] + 4)] < 128
        gs, marks, info = groups(band)
        if len(gs) != len(chars):
            continue
        lab, base, xh = info
        # The gaps between letters of one word, for the font's spacing.
        words = visual(text).split()
        k = 0
        for word in words:
            for j in range(len(word)):
                g = gs[k + j]
                glyph = np.isin(lab[g['y0']:g['y1'], g['x0']:g['x1']], g['ids'])
                store.setdefault(word[j], []).append({'img': np.packbits(glyph), 'shape': glyph.shape, 'top': g['y0'] - base, 'xh': base - xh})
                if j + 1 < len(word):
                    store.setdefault('_gap', []).append(g['x0'] - gs[k + j + 1]['x1'])
            k += len(word)
        for m in marks:
            store.setdefault('_marks', []).append(1)
        kept += 1
    return kept


if __name__ == '__main__':
    import pickle, torch
    torch.set_num_threads(1)
    net = load(sys.argv[1])
    store = {}
    for f in sorted(glob.glob(f'{sys.argv[2]}/*.pdf')):
        d = pymupdf.open(f)
        for p in range(1, len(d)):
            imgs = d[p].get_images()
            if not imgs:
                continue
            a = deskew(np.array(Image.open(io.BytesIO(d.extract_image(imgs[0][0])['image'])).convert('L')))
            if a.shape[1] > 2200:
                continue
            n = harvest(net, a, store)
            print(os.path.basename(f), p, n, 'lines', sum(len(v) for k, v in store.items() if not k.startswith('_')), 'letters', flush=True)
        pickle.dump(store, open(sys.argv[3], 'wb'))
