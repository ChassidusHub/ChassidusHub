"""The error report for one save of a model: every line it got wrong (text
it should have read, text it read, and the exact changes), the counts per
kind of mistake, and one summary row added to errors/history.jsonl so the
saves of a run can be compared mistake by mistake.

    errlog.py <reading.npz> <save name> [--dir errors]"""
import argparse, collections, json, os, sys, time, unicodedata
import numpy as np
from rapidfuzz.distance import Levenshtein
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from score import report, confusions, kind

ap = argparse.ArgumentParser()
ap.add_argument('npz')
ap.add_argument('name')
ap.add_argument('--dir', default='errors')
a = ap.parse_args()
os.makedirs(a.dir, exist_ok=True)
d = np.load(a.npz, allow_pickle=True)
nfd = lambda t: unicodedata.normalize('NFD', str(t))
gts, preds, paths = [nfd(g) for g in d['gts']], [nfd(p) for p in d['preds']], [str(p) for p in d['paths']]
show = lambda c: '∅' if c == '' else ('␣' if c == ' ' else c)

lines = []
for g, h, p in zip(gts, preds, paths):
    if g == h:
        continue
    ops = []
    for op in Levenshtein.editops(g, h):
        x = g[op.src_pos] if op.tag != 'insert' else ''
        y = h[op.dest_pos] if op.tag != 'delete' else ''
        ops.append({'at': op.src_pos, 'was': show(x), 'read': show(y), 'kind': kind(x or y)})
    lines.append({'line': p, 'truth': g, 'read': h, 'errors': len(ops), 'changes': ops})
lines.sort(key=lambda l: -l['errors'])

out = {'save': a.name, 'when': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
       'score': report(a.name, gts, preds, paths), 'mistakes': confusions(gts, preds, top=40), 'wrong_lines': lines}
# the look-alike letters we drill, counted on their own
HARD = {('ב', 'כ'), ('כ', 'ב'), ('ת', 'ח'), ('ח', 'ת'), ('ז', 'ן'), ('ן', 'ז'), ('ן', 'ו'), ('ו', 'ן'), ('ז', 'ו'), ('ו', 'ז')}
hard = sum(1 for l in lines for c in l['changes'] if (c['was'], c['read']) in HARD)
out['score']['hard_letters'] = hard
json.dump(out, open(f'{a.dir}/{a.name}.json', 'w'), ensure_ascii=False, indent=1)
with open(f'{a.dir}/{a.name}.txt', 'w') as f:
    f.write(json.dumps(out['score'], ensure_ascii=False) + '\n' + json.dumps(out['mistakes'], ensure_ascii=False) + '\n\n')
    for l in lines:
        f.write(f"{l['line']}  ({l['errors']})\nTRUTH {l['truth']}\nREAD  {l['read']}\n"
                + '  '.join(f"{c['was']}→{c['read']}" for c in l['changes']) + '\n\n')
row = {'save': a.name, 'when': out['when'], **{k: out['score'][k] for k in ('lines', 'char_acc', 'word_acc', 'lines_perfect', 'hard_letters')},
       'by_kind': out['mistakes']['by_kind'], 'top': out['mistakes']['top'][:15]}
with open(f'{a.dir}/history.jsonl', 'a') as f:
    f.write(json.dumps(row, ensure_ascii=False) + '\n')
print(json.dumps(row, ensure_ascii=False))
