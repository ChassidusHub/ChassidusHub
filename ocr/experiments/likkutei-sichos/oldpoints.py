"""Real pointed letters from the old volumes (1-14), which have no typed
text: every ink group on a body line that is shaped like the old font's א
(compared with the average of the scanned אs) and has a mark under it is
cut whole; the mark's shape tells פתח (a flat bar) from קמץ (a bar with a
stem). Lines are found by layout alone; no reading is needed.

    python3 oldpoints.py <pdf dir> <old letters.pkl> <out.pkl>"""
import glob, os, pickle, sys
import numpy as np
import pymupdf
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from layout import deskew, scan, page_layout
from harvest import groups
from buildfont import typical, average
from light import _norm


def template(store, ch):
    keep, mh, mw, mt = typical(store[ch])
    mean, P = average(keep[:400], mh, mw, mt, rounds=1)
    return _norm(mean > 0.5), mh, mw


if __name__ == '__main__':
    pdfs, letters, out = sys.argv[1:4]
    old = pickle.load(open(letters, 'rb'))
    alef, ah, aw = template(old, 'א')
    store = pickle.load(open(out, 'rb')) if os.path.exists(out) else {}
    for f in sorted(glob.glob(f'{pdfs}/*.pdf')):
        if f in store.get('_done', []):
            continue
        d = pymupdf.open(f)
        for p in range(1, len(d)):
            a = scan(d, p)
            if a is None or a.shape[0] < 1000:
                continue
            a = deskew(a)
            lay = page_layout(a)
            h, w = a.shape
            for col in lay['body']:
                for l in col:
                    band = a[max(0, l['y0'] - 4):min(h, l['y1'] + 14), max(0, l['x0'] - 4):min(w, l['x1'] + 4)] < 128
                    gs, marks, info = groups(band)
                    if not info:
                        continue
                    lab, base, xh = info
                    for g in gs:
                        if abs((g['y1'] - g['y0']) - ah) > 3 or abs((g['x1'] - g['x0']) - aw) > 3:
                            continue
                        under = [m for m in marks if g['x0'] - 2 <= (m['x0'] + m['x1']) / 2 <= g['x1'] + 2 and -2 <= m['y0'] - base < 0.5 * (base - xh)]
                        if len(under) != 1:
                            continue
                        v = _norm(np.isin(lab[g['y0']:g['y1'], g['x0']:g['x1']], g['ids']))
                        if v is None or float((v * alef).sum()) < 0.75:
                            continue
                        m = under[0]
                        mh_, mw_ = m['y1'] - m['y0'], m['x1'] - m['x0']
                        if mw_ < 0.25 * aw or mw_ > 0.8 * aw:
                            continue
                        # A פתח is a bar about a sixth of the letters' height thick; a קמץ, bar
                        # and stem, stands about a quarter high. Between the two is left out.
                        x = base - xh
                        kind = 'אַ' if mh_ <= 0.18 * x else ('אָ' if mh_ >= 0.22 * x else None)
                        if not kind:
                            continue
                        y0, y1 = g['y0'], max(g['y1'], m['y1'])
                        x0, x1 = min(g['x0'], m['x0']), max(g['x1'], m['x1'])
                        img = np.isin(lab[y0:y1, x0:x1], g['ids'] + m['ids'])
                        store.setdefault(kind, []).append({'img': np.packbits(img), 'shape': img.shape, 'top': y0 - base, 'xh': base - xh})
        store.setdefault('_done', []).append(f)
        print(os.path.basename(f), {k: len(v) for k, v in store.items() if not k.startswith('_')}, flush=True)
        pickle.dump(store, open(out + '.tmp', 'wb'))
        os.replace(out + '.tmp', out)
