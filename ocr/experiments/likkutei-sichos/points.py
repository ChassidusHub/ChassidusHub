"""Real scanned Yiddish pointed letters (אַ, אָ, פּ, and the rarer ones) from
the training lines of vols 30-38 whose typed text has points. Each is cut
whole, the letter with its point, so the point keeps its true place.

    python3 points.py <pairs dir> <out.pkl>"""
import glob, pickle, re, sys
import numpy as np
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from harvest import groups, visual

POINT = re.compile('[ְ-ׇ]')

if __name__ == '__main__':
    store = {}
    files = [f for f in glob.glob(f'{sys.argv[1]}/3[0-8]/*.gt.txt') if POINT.search(open(f).read())]
    for f in files:
        label = open(f).read().strip()
        a = np.array(Image.open(f[:-7] + '.png').convert('L'))
        letters = re.findall('([^\\sְ-ׇ])([ְ-ׇ]*)', visual(label))
        gs, marks, info = groups(a < 128)
        if not info or len(gs) != len(letters):
            continue
        lab, base, xh = info
        for (ch, pts), g in zip(letters, gs):
            if not pts:
                continue
            x0, x1, y0, y1, ids = g['x0'], g['x1'], g['y0'], g['y1'], list(g['ids'])
            # The points under this letter: marks whose middle is within its width.
            for mk in marks:
                if x0 - 2 <= (mk['x0'] + mk['x1']) / 2 <= x1 + 2 and mk['y0'] - base < 0.6 * (base - xh):
                    ids += mk['ids']; x0, x1, y1 = min(x0, mk['x0']), max(x1, mk['x1']), max(y1, mk['y1'])
            if 'ּ' not in pts and len(ids) == len(g['ids']):
                continue  # a point under the letter was looked for and not found
            img = np.isin(lab[y0:y1, x0:x1], ids)
            store.setdefault('F:' + ch + pts, []).append({'img': np.packbits(img), 'shape': img.shape, 'top': y0 - base, 'xh': base - xh})
    pickle.dump(store, open(sys.argv[2], 'wb'))
    print(len(files), 'lines;', {k: len(v) for k, v in store.items()})
