"""Keeps a cut digit only if its shape is closer to that digit than to any
Hebrew letter, both drawn in Shmuly's Frank: in old prints the first-pass
model read some letters as digits (a ל whose top was cut off as 7), and a
font must not learn a letter as a digit.

    python3 digit_filter.py <letters.pkl> <out.pkl> <Frank.ttf>"""
import pickle, sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from light import _norm, _rendered

if __name__ == '__main__':
    store = pickle.load(open(sys.argv[1], 'rb'))
    font = sys.argv[3]
    letters = [chr(c) for c in range(0x5D0, 0x5EB)]
    for k in [k for k in store if not k.startswith('_') and k[-1].isdigit()]:
        d = k[-1]
        kept = []
        for r in store[k]:
            g = np.unpackbits(r['img'])[:np.prod(r['shape'])].reshape(r['shape'])
            v = _norm(g)
            if v is None:
                continue
            own = float((v * _rendered(d, font)).sum())
            if own > max(float((v * _rendered(c, font)).sum()) for c in letters):
                kept.append(r)
        print(k, len(store[k]), '->', len(kept), flush=True)
        store[k] = kept
    pickle.dump(store, open(sys.argv[2], 'wb'))
