"""Find letter copies filed under the wrong letter in a scanned-letter bank:
each copy (from the modal-size set the line builder uses) is compared with
every letter's average shape, and a copy that looks more like another
letter's average than its own is listed (and, with --write, removed).

    bankcheck.py <letters.pkl> [--write out.pkl]"""
import pickle, sys
import numpy as np
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from buildfont import typical, unpack

S = 32


def norm(g, top=0):
    """The copy at its true size on a fixed canvas, right edges and baseline
    together (size tells ו from ר and ן from ז), lightly blurred so a pixel's
    shift doesn't count as a different shape."""
    c = np.zeros((S * 2, S * 2), np.float32)
    h, w = min(g.shape[0], S * 2), min(g.shape[1], S * 2)
    y = min(max(S + top, 0), S * 2 - h)
    c[y:y + h, S * 2 - w:] = g[:h, g.shape[1] - w:]
    return np.asarray(Image.fromarray((c * 255).astype(np.uint8)).resize((S, S), Image.BILINEAR), np.float32) / 255


bank = pickle.load(open(sys.argv[1], 'rb'))
keys = [k for k in bank if not k.startswith('_') and len(k.split(':')[-1]) == 1 and 'א' <= k.split(':')[-1] <= 'ת']
means, sets = {}, {}
for k in keys:
    keep = typical(bank[k])[0]
    if len(keep) < 20:
        continue
    sets[k] = keep
    means[k] = np.mean([norm(unpack(r), r['top']) for r in keep[:2000]], 0)
bad = {}
for k, keep in sets.items():
    pre = k.split(':')[0] if ':' in k else ''
    rivals = [o for o in means if (o.split(':')[0] if ':' in o else '') == pre]
    M = np.array([means[o] for o in rivals])
    for r in keep:
        g = norm(unpack(r), r['top'])
        d = ((M - g) ** 2).sum((1, 2))
        best = rivals[int(d.argmin())]
        if best != k and d.min() < 0.8 * d[rivals.index(k)]:
            bad.setdefault(k, []).append((best, id(r)))
for k, v in sorted(bad.items(), key=lambda kv: -len(kv[1])):
    c = {}
    for b, _ in v:
        c[b] = c.get(b, 0) + 1
    print(k, len(v), 'of', len(sets[k]), 'look like', dict(sorted(c.items(), key=lambda x: -x[1])[:4]))
if len(sys.argv) > 3 and sys.argv[2] == '--write':
    ids = {i for v in bad.values() for _, i in v}
    for k in keys:
        bank[k] = [r for r in bank[k] if id(r) not in ids]
    pickle.dump(bank, open(sys.argv[3], 'wb'))
    print('removed', len(ids))
