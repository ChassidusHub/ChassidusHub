"""A font of the old Likkutei Sichos typeface (vols 1-14), from the letters
harvest.py cut out of the scans. For each letter: the copies of its usual
size and place (a misread or a pointed alef is another size) are lined up
on each other, each nudged a pixel either way to fit the rest best, and
averaged; the average, drawn four times larger, is traced into outlines.
Spacing is each letter's width plus the usual gap between letters.

    python3 buildfont.py <letters.pkl> <out.otf> [min copies]"""
import pickle, sys
import numpy as np
from PIL import Image
import potrace

UP = 4  # traced at four times the scan's size


def unpack(r):
    h, w = r['shape']
    return np.unpackbits(r['img'])[:h * w].reshape(h, w).astype(np.float32)


def typical(samples):
    hs = np.array([r['shape'][0] for r in samples]); ws = np.array([r['shape'][1] for r in samples]); ts = np.array([r['top'] for r in samples])
    mh, mw, mt = (int(np.bincount(v - v.min()).argmax() + v.min()) for v in (hs, ws, ts))
    keep = [r for r, h, w, t in zip(samples, hs, ws, ts) if abs(h - mh) <= 2 and abs(w - mw) <= 2 and abs(t - mt) <= 2]
    return keep, mh, mw, mt


def average(keep, mh, mw, mt, rounds=3, limit=3000):
    keep = keep[:limit]
    H, W, P = mh + 8, mw + 8, 4
    placed = []
    for r in keep:
        g = unpack(r); c = np.zeros((H, W), np.float32)
        y = P + (r['top'] - mt); x = P + (mw - g.shape[1])  # right edges together: Hebrew is set from the right
        y = min(max(y, 0), H - g.shape[0]); x = min(max(x, 0), W - g.shape[1])
        c[y:y + g.shape[0], x:x + g.shape[1]] = g
        placed.append(c)
    placed = np.array(placed)
    mean = placed.mean(0)
    for _ in range(rounds):
        out = []
        for c in placed:
            best = max(((dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)), key=lambda s: (np.roll(np.roll(c, s[0], 0), s[1], 1) * mean).sum())
            out.append(np.roll(np.roll(c, best[0], 0), best[1], 1))
        placed = np.array(out); mean = placed.mean(0)
    return mean, P


def trace(mean):
    big = np.array(Image.fromarray((mean * 255).astype(np.uint8)).resize((mean.shape[1] * UP, mean.shape[0] * UP), Image.BICUBIC)) > 127
    return potrace.Bitmap(~big).trace(  # potracer fills the False pixels
        turdsize=8, alphamax=1.0, opticurve=True, opttolerance=0.2)


def draw(path, pen, to_font):
    for curve in path:
        pen.moveTo(to_font(curve.start_point))
        for seg in curve.segments:
            if seg.is_corner:
                pen.lineTo(to_font(seg.c)); pen.lineTo(to_font(seg.end_point))
            else:
                pen.curveTo(to_font(seg.c1), to_font(seg.c2), to_font(seg.end_point))
        pen.closePath()


def build(store, out, minimum=200, family='RebbeHub Old LS'):
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    gaps = np.array(store.get('_gap', [2]))
    gap = float(np.median(gaps[(gaps >= 0) & (gaps < 20)]))
    letters = {k: v for k, v in store.items() if not k.startswith('_') and len(v) >= minimum}
    heights = [typical(store[c])[1] for c in 'בכמנסר' if c in store]
    xh = float(np.median(heights)) if heights else 30.0
    S = 600.0 / xh  # font units per scan pixel: the letters' height is 600 of 1000
    fb = FontBuilder(1000, isTTF=False)
    names = ['.notdef', 'space'] + [f'uni{ord(c):04X}' for c in letters]
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({32: 'space', **{ord(c): f'uni{ord(c):04X}' for c in letters}})
    charstrings, metrics, report = {}, {}, {}
    empty = T2CharStringPen(0, None); charstrings['.notdef'] = empty.getCharString(); metrics['.notdef'] = (500, 0)
    sp = T2CharStringPen(0, None); charstrings['space'] = sp.getCharString(); metrics['space'] = (int(round((gap * 3.2) * S)), 0)
    for c, samples in letters.items():
        keep, mh, mw, mt = typical(samples)
        mean, P = average(keep, mh, mw, mt)
        path = trace(mean)
        lsb = gap / 2
        # canvas pixel (x, y) -> font units: x from the letter's left edge plus half a gap; y up from the baseline.
        to_font = lambda p, P=P, mt=mt: (round(((p.x / UP) - P + lsb) * S), round(-((p.y / UP) - P + mt) * S))
        pen = T2CharStringPen(0, None)
        draw(path, pen, to_font)
        n = f'uni{ord(c):04X}'
        charstrings[n] = pen.getCharString()
        metrics[n] = (int(round((mw + gap) * S)), int(round(lsb * S)))
        report[c] = {'copies': len(samples), 'used': len(keep)}
    fb.setupCFF(family.replace(' ', ''), {'FullName': family}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-300)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-300, usWinAscent=900, usWinDescent=300)
    fb.setupPost()
    fb.save(out)
    return report


if __name__ == '__main__':
    store = pickle.load(open(sys.argv[1], 'rb'))
    rep = build(store, sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 200)
    for c, r in sorted(rep.items(), key=lambda x: -x[1]['copies']):
        print(c, r)
