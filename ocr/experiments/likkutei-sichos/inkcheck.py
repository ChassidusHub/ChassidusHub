"""Unexplained ink: a mark the model left out has no confidence, but it
still has ink. Each letter the model emits sits at a frame of the line;
every blob of ink on the scan should have an emitted letter near it. A blob
with none (a dropped dash, the dots of ". . .") flags the line, whatever the
confidence says.

    inkcheck.py <reading.npz> [--near 0.6] [--min-px 6]"""
import argparse, json, sys, unicodedata
import numpy as np
from PIL import Image
from scipy import ndimage

def emitted_x(p, W):
    """x on the scan (in pixels) of every frame where a letter was emitted."""
    best = p.argmax(1); T = len(best)
    xs, prev = [], 0
    for t, b in enumerate(best):
        if b != 0 and b != prev:
            xs.append((t + 0.5) * W / T)
        prev = b
    return np.array(xs), W / T

def unexplained(path, p, near=0.6, min_px=6):
    im = np.array(Image.open(path).convert('L'))
    ink = im < 128
    lab, n = ndimage.label(ink)
    xs, step = emitted_x(p, im.shape[1])
    h = im.shape[0]
    out = []
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        size = (lab[sl] == k).sum()
        if size < min_px:
            continue  # specks of dirt
        x0, x1 = sl[1].start, sl[1].stop
        # the blob is explained if a letter was emitted over it or within
        # `near` of a letter height from either side of it
        pad = near * h
        if not len(xs) or not ((xs >= x0 - pad) & (xs <= x1 + pad)).any():
            out.append((x0, x1, sl[0].start, sl[0].stop, int(size)))
    return out

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('npz'); ap.add_argument('--near', type=float, default=0.6)
    ap.add_argument('--min-px', type=int, default=6)
    ap.add_argument('--checked', default='ev/dev300_checked.json')
    a = ap.parse_args()
    d = np.load(a.npz, allow_pickle=True)
    nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
    chk = {p: nfd(t) for p, t in json.load(open(a.checked)).items()}
    flagged = wrong = hit = 0
    for path, p, h in zip(d['paths'], d['probs'], d['preds']):
        path = str(path); bad = nfd(h) != chk[path]
        u = unexplained(path, p, a.near, a.min_px)
        flagged += bool(u); wrong += bad; hit += bool(u) and bad
        if u or bad:
            print(('WRONG ' if bad else '      ') + ('FLAG ' if u else '     ') + path, u[:3])
    print(f'flagged {flagged} of {len(d["paths"])} lines; wrong lines {wrong}, flagged among them {hit}')
