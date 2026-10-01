"""Ask the letter judge about the look-alike letters of a reading, and see on
labelled lines what it would change. Two ways of choosing where to ask:

- hesitant: the line model gave the look-alike at least --min-prob at that frame;
- all: every letter of the judged set (shows the judge's raw agreement).

A letter is swapped when the judge is at least --sure (0.9) for the other
letter. Reports fixes and breaks against the labels, like confix.py.

    judgeapply.py <reading.npz> <judge.pt> [--where hesitant|all --min-prob 1e-3 --sure 0.9 --out changes.txt]"""
import argparse, json, re, sys, unicodedata
import numpy as np
import torch
from PIL import Image
from rapidfuzz.distance import Levenshtein
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from score import report
from judge import Judge, LETTERS, prep
from confix import read_frames, PAIRS
from kraken.lib.bidi import get_display_map

nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
GROUPS = [set('בכ'), set('תח'), set('זןו')]


def crop(im, x, size=64):
    h = im.height; w = int(1.3 * h); x0 = int(x - w / 2)
    box = Image.new('L', (w, h), 255)
    box.paste(im.crop((max(0, x0), 0, min(im.width, x0 + w), h)), (max(0, -x0), 0))
    c = box.resize((size, int(size * h / w)), Image.LANCZOS) if h < w else box.resize((int(size * w / h), size), Image.LANCZOS)
    sq = Image.new('L', (size, size), 255); sq.paste(c, ((size - c.width) // 2, (size - c.height) // 2))
    return np.asarray(sq, dtype=np.uint8)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('npz'); ap.add_argument('judge')
    ap.add_argument('--where', default='hesitant', choices=['hesitant', 'all'])
    ap.add_argument('--min-prob', type=float, default=1e-3); ap.add_argument('--sure', type=float, default=0.9)
    ap.add_argument('--out'); ap.add_argument('--threads', type=int, default=4)
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    net = Judge(); net.load_state_dict(torch.load(a.judge)); net.eval()
    d = np.load(a.npz, allow_pickle=True)
    labels = [str(l) if (l or i == 0) else chr(0xE000 + i) for i, l in enumerate(d['labels'])]
    idx = {l: i for i, l in enumerate(labels)}
    gts = [nfd(g) for g in d['gts']]; paths = [str(p) for p in d['paths']]
    old, new, rows, asked, fixed, broke = [], [], [], 0, 0, 0
    for g, p, path in zip(gts, d['probs'], paths):
        fr = read_frames(p, labels); vis = ''.join(c for c, _ in fr)
        if not vis:
            old.append(''); new.append(''); continue
        log, order = get_display_map(vis, 'R'); chars = list(log)
        im = None; W = None; T = len(p); todo = []
        for k, c in enumerate(log):
            if c not in LETTERS:
                continue
            grp = next(gset for gset in GROUPS if c in gset)
            t = fr[order[k]][1]
            if a.where == 'hesitant':
                alt_p = max(float(p[max(0, t - 1):t + 2, idx[o]].max()) for o in grp if o != c and o in idx)
                if alt_p < a.min_prob:
                    continue
            todo.append((k, t, grp))
        if todo:
            im = Image.open(path).convert('L'); W = im.width
            x = torch.from_numpy(np.stack([crop(im, (t + 0.5) * W / T) for _, t, _ in todo]))
            with torch.no_grad():
                pr = torch.softmax(net(prep(x, False)), 1).numpy()
            ch = []
            for (k, t, grp), q in zip(todo, pr):
                asked += 1
                # the judge chooses only within the letter's own look-alike group
                cand = {o: q[LETTERS.index(o)] for o in grp}
                best = max(cand, key=cand.get); s = cand[best] / sum(cand.values())
                if best != log[k] and s >= a.sure:
                    ch.append((log[k], best, round(float(s), 3))); chars[k] = best
            o, n = nfd(log), nfd(''.join(chars))
            if ch:
                was, now = Levenshtein.distance(g, o), Levenshtein.distance(g, n)
                fixed += now < was; broke += now > was
                rows.append((path, 'better' if now < was else 'worse' if now > was else 'same', o, n, ch))
        else:
            o = n = nfd(log)
        old.append(o); new.append(n)
    print(json.dumps({'before': report('greedy', gts, old, paths), 'after': report('judge', gts, new, paths),
                      'asked': asked, 'lines_fixed': fixed, 'lines_broken': broke, 'changed': len(rows)}, ensure_ascii=False))
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            for path, v, o, n, ch in rows:
                f.write(f'{path} {v}\nOLD {o}\nNEW {n}\n' + ' '.join(f'{x}→{y}({s})' for x, y, s in ch) + '\n\n')
