"""Line-level check: a letter the model leaves out has no confidence of its
own, but the frames where it was left out usually show a second choice.
Score each line by its least sure moment (lowest letter confidence, or the
strongest non-blank pull in a frame read as blank) and see whether the lines
with mistakes are the ones that score low."""
import json, sys, unicodedata
import numpy as np
sys.path.insert(0, 'code')
from relabel import reading
nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
d = np.load(sys.argv[1], allow_pickle=True)
chk = {p: nfd(t) for p, t in json.load(open('ev/dev300_checked.json')).items()}
labels = [str(l) if (l or i == 0) else chr(0xE000 + i) for i, l in enumerate(d['labels'])]
rows = []
for path, p in zip(d['paths'], d['probs']):
    text, cs = reading(p, labels)
    blank = p.argmax(1) == 0
    pull = (1 - p[blank, 0]).max() if blank.any() else 0
    sure = min(min(cs) if cs else 1, 1 - pull)
    rows.append((sure, text != chk[str(path)], str(path)))
rows.sort()
bad = sum(r[1] for r in rows)
print(f'{len(rows)} lines, {bad} with a mistake')
for k in (5, 10, 15, 20, 30, 45, 60):
    print(f'check the {k:2d} least sure lines ({100*k/len(rows):4.1f}%): finds {sum(r[1] for r in rows[:k])} of {bad}')
for e in (.5, .8, .9, .95, .99):
    sel = [r for r in rows if r[0] < e]
    print(f'line sureness < {e}: {len(sel)} lines, {sum(r[1] for r in sel)} wrong; >= {e}: {len(rows)-len(sel)} lines, {bad-sum(r[1] for r in sel)} wrong')
print('missed:', [(round(r[0], 3), r[2]) for r in rows if r[1] and r[0] >= .9])
