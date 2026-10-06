"""Compare saves on the 4,500-line vol 39 test: each reading (evalx npz) against the
checked labels of the focus model's final test (ev/final/focus_full.npz 'gts', same
line order), as in benchmarks.md's final table.

    cmp4500.py ev/final/focus_full.npz ev/run3/final/*.npz"""
import sys, unicodedata, re
import numpy as np
from rapidfuzz.distance import Levenshtein
nfd = lambda t: unicodedata.normalize('NFD', str(t))
HARD = {frozenset('בכ'), frozenset('תח'), frozenset('זן'), frozenset('זו'), frozenset('ןו')}
ref = np.load(sys.argv[1], allow_pickle=True)
paths = [str(p) for p in ref['paths']]; gts = [nfd(g) for g in ref['gts']]
# the final table's labels: the typed text plus the line-edge dashes and ". . ." the
# focus model read that the labels lacked (9 of 9 checked by eye were printed)
EDGE = re.compile(r'^(— |\. \. \. )|( —)$')
fixed = 0
for i, (g, h) in enumerate(zip(gts, [nfd(x) for x in ref['preds']])):
    if g != h and EDGE.sub('', h) == EDGE.sub('', g) and len(h) > len(g):
        gts[i] = h; fixed += 1
print(fixed, 'labels take the edge mark the focus model read')
print('| Model | Letters | Words | Lines perfect | Body | Notes | Mistakes | Hard | Dash dropped / added | Dots dropped / added |')
print('|---|---|---|---|---|---|---|---|---|---|')
for fn in sys.argv[1:]:
    d = np.load(fn, allow_pickle=True)
    order = {str(p): i for i, p in enumerate(d['paths'])}
    preds = [nfd(d['preds'][order[p]]) if p in order else '' for p in paths]
    tot = err = words = werr = perfect = hard = 0
    kind = {'b': [0, 0], 'n': [0, 0]}
    dash = [0, 0]; dots = [0, 0]
    for p, g, h in zip(paths, gts, preds):
        n = len(g); e = Levenshtein.distance(g, h)
        tot += n; err += e; perfect += g == h
        k = 'n' if re.search(r'_n\d+\.png$', p) else 'b'
        kind[k][0] += n; kind[k][1] += e
        gw, hw = g.split(), h.split(); words += len(gw)
        werr += Levenshtein.distance(gw, hw)
        for op in Levenshtein.editops(g, h):
            if op.tag == 'replace' and frozenset((g[op.src_pos], h[op.dest_pos])) in HARD:
                hard += 1
        dash[0] += g.count('—') > h.count('—'); dash[1] += h.count('—') > g.count('—')
        dots[0] += g.count('. .') > h.count('. .'); dots[1] += h.count('. .') > g.count('. .')
    name = fn.rsplit('/', 1)[-1].replace('.npz', '')
    print(f"| {name} | {100 * (1 - err / tot):.2f} | {100 * (1 - werr / words):.2f} | {100 * perfect / len(gts):.1f} | {100 * (1 - kind['b'][1] / kind['b'][0]):.2f} | {100 * (1 - kind['n'][1] / kind['n'][0]):.2f} | {err} | {hard} | {dash[0]} / {dash[1]} | {dots[0]} / {dots[1]} |")
