"""Drop light-face (Miram) copies from a scanned-letter bank of the body face:
each copy's stroke width (ink area over skeleton length) is compared with
the median of its letter, and copies clearly thinner are removed. Shmuly
caught a Miram ס among the old-font Frank letters (2026-10-01).

    bankweight.py <letters.pkl> <out.pkl> [ratio 0.8]"""
import pickle, sys
import numpy as np
from skimage.morphology import skeletonize
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from buildfont import unpack

bank = pickle.load(open(sys.argv[1], 'rb'))
ratio = float(sys.argv[3]) if len(sys.argv) > 3 else 0.8


def stroke(r):
    g = unpack(r) > 0.5
    sk = skeletonize(g).sum()
    return g.sum() / max(sk, 1)


total = 0
for k, v in bank.items():
    ch = k.split(':')[-1]
    # letters only: marks and the small י ו have too little stroke to measure
    if k.startswith('_') or not isinstance(v, list) or len(v) < 30 or not ('\u05d0' <= ch[:1] <= '\u05ea') or ch in 'יו':
        continue
    w = np.array([stroke(r) for r in v])
    med = np.median(w)
    keep = [r for r, x in zip(v, w) if x >= ratio * med]
    total += len(v) - len(keep)
    if len(v) - len(keep) > 0.03 * len(v):
        print(k, len(v) - len(keep), 'of', len(v), 'light')
    bank[k] = keep
pickle.dump(bank, open(sys.argv[2], 'wb'))
print('removed', total)
