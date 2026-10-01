"""The final comparison: every save (and the focus model) on the 4,500 dev39 +
test39 lines, scored against the labels after the ink fix and against the
typed labels before it, with dash and ". . ." mistakes counted by direction
(dropped and inserted apart), so a drill that overshoots shows.

    compare.py <ink.jsonl.gz> <name=reading.npz> ..."""
import gzip, json, sys, unicodedata
import numpy as np
from rapidfuzz.distance import Levenshtein
sys.path.insert(0, 'code')
from score import report, confusions
nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
old = {}
for l in gzip.open(sys.argv[1], 'rt', encoding='utf-8'):
    r = json.loads(l)
    if r.get('new'):
        old[r['p']] = nfd(r['old'])


def marks(gts, hyps):
    c = {'dash dropped': 0, 'dash inserted': 0, 'dot dropped': 0, 'dot inserted': 0}
    for g, h in zip(gts, hyps):
        for op in Levenshtein.editops(g, h):
            a = g[op.src_pos] if op.tag != 'insert' else ''
            b = h[op.dest_pos] if op.tag != 'delete' else ''
            for ch, k in (('—', 'dash'), ('.', 'dot')):
                if a == ch and b != ch: c[k + ' dropped'] += 1
                if b == ch and a != ch: c[k + ' inserted'] += 1
    return c


rows = []
for arg in sys.argv[2:]:
    name, fn = arg.split('=', 1)
    d = np.load(fn, allow_pickle=True)
    paths = [str(p) for p in d['paths']]
    gts = [nfd(g) for g in d['gts']]; hyps = [nfd(h) for h in d['preds']]
    before = [old.get(p, g) for p, g in zip(paths, gts)]
    r = report(name, gts, hyps, paths); b = report(name, before, hyps, paths)
    rows.append({'name': name, 'fixed': r, 'typed': b, 'marks': marks(gts, hyps),
                 'mistakes': confusions(gts, hyps, top=10)})
    m = rows[-1]['marks']
    print(f"{name:28s} fixed {r['char_acc']:6.2f} {r['word_acc']:6.2f} {r['lines_perfect']:5.1f} | typed {b['char_acc']:6.2f} {b['lines_perfect']:5.1f} | "
          f"dash -{m['dash dropped']} +{m['dash inserted']} dot -{m['dot dropped']} +{m['dot inserted']}", flush=True)
json.dump(rows, open('ev/compare.json', 'w'), ensure_ascii=False, indent=1)
