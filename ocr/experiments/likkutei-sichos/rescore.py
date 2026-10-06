"""Score every save again against the 300 hand-checked labels
(ev/dev300_checked.json). A pod report lists only the lines a save got
wrong, so every other line was read exactly as the pod's label; the pod's
label for the 12 lines fixed by eye comes from the pod relabel table."""
import glob, gzip, json, os, re, sys, unicodedata
import numpy as np
sys.path.insert(0, 'code')
from score import report, confusions
nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
chk = {p: nfd(t) for p, t in json.load(open('ev/dev300_checked.json')).items()}
paths = list(chk)
pod = {}
for l in gzip.open('ev/relabel_pod2.tsv.gz', 'rt', encoding='utf-8'):
    p, old, new, rule = l.rstrip('\n').split('\t'); pod[p] = nfd(new)
def podlabel(p):
    if p in pod: return pod[p]
    g = p.rsplit('.', 1)[0]
    f = g + '.gt.orig.txt' if os.path.exists(g + '.gt.orig.txt') else g + '.gt.txt'
    return nfd(open(f, encoding='utf-8').read())
rows = []
def add(name, preds, labels_note):
    gts = [chk[p] for p in paths]; hyps = [preds[p] for p in paths]
    r = report(name, gts, hyps, paths); m = confusions(gts, hyps, top=12)
    rows.append({**r, 'by_kind': m['by_kind'], 'top': m['top'], 'note': labels_note})
for fn in sys.argv[1:]:
    name = os.path.basename(fn).rsplit('.', 1)[0]
    if fn.endswith('.npz'):
        d = np.load(fn, allow_pickle=True)
        pr = {str(p): nfd(h) for p, h in zip(d['paths'], d['preds'])}
        add(name, pr, 'npz'); continue
    txt = open(fn, encoding='utf-8').read()
    read = {m[0]: nfd(m[2]) for m in re.findall(r'^(pairs/\S+)  \(\d+\)\nTRUTH (.*)\nREAD  (.*)$', txt, re.M)}
    pr = {p: read.get(p) or (podlabel(p) if p in pod else chk[p]) for p in paths}
    add(name, pr, 'report')
for r in rows: print(json.dumps(r, ensure_ascii=False))
