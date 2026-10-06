"""Is the model's confidence honest? Each letter it read gets the peak
probability of its frames; bin the letters by that and count how many in
each bin are wrong against the hand-checked labels. Letters it left out
have no confidence of their own, so they are counted apart.

    calib.py <reading.npz> [checked.json]"""
import json, sys, unicodedata
import numpy as np
from rapidfuzz.distance import Levenshtein
sys.path.insert(0, 'code')
from relabel import reading
nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
d = np.load(sys.argv[1], allow_pickle=True)
chk = {p: nfd(t) for p, t in json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'ev/dev300_checked.json')).items()}
labels = [str(l) if (l or i == 0) else chr(0xE000 + i) for i, l in enumerate(d['labels'])]
edges = [0, .5, .8, .9, .95, .99, .999, 1.0001]
n, bad, dropped, low_drop = np.zeros(len(edges) - 1), np.zeros(len(edges) - 1), 0, []
allc, allok = [], []
for path, p in zip(d['paths'], d['probs']):
    text, cs = reading(p, labels)
    g = chk[str(path)]
    wrong = set()
    for op in Levenshtein.editops(g, text):
        if op.tag in ('replace', 'insert'): wrong.add(op.dest_pos)
        else: dropped += 1
    for i, c in enumerate(cs):
        b = np.searchsorted(edges, c, 'right') - 1
        n[b] += 1; bad[b] += i in wrong
        allc.append(c); allok.append(i not in wrong)
print('confidence     letters  wrong  error rate  model expects')
for k in range(len(n)):
    if n[k]:
        mask = [(edges[k] <= c < edges[k + 1]) for c in allc]
        exp = 1 - np.mean([c for c, m in zip(allc, mask) if m])
        print(f'{edges[k]:.3f}-{min(edges[k+1],1):.3f}  {int(n[k]):8d}  {int(bad[k]):5d}  {100*bad[k]/n[k]:9.3f}%  {100*exp:9.3f}%')
tot = int(n.sum()); print(f'all          {tot:8d}  {int(bad.sum()):5d}  {100*bad.sum()/tot:9.3f}%   + {dropped} letters left out (no confidence)')
c, ok = np.array(allc), np.array(allok)
for t in (.9, .95, .99):
    sel = c < t
    print(f'flag below {t}: {sel.sum()} letters ({100*sel.mean():.2f}%), catches {(~ok & sel).sum()} of {(~ok).sum()} wrong letters')
