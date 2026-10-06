"""Re-decide each line letter by letter with a letter 6-gram built from the
typed volumes 30-38 (the research found letter models help line OCR more than
word models, and they don't trip over abbreviations or words split at a line
end). A plain CTC prefix beam search: each beam is scored by the network's own
probabilities plus alpha times the letter model, plus beta per letter.

    charlm.py <reading.npz> [--alpha A --beta B --beam 16] [--sweep]

Works in the network's (picture) order, like the letter model's corpus."""
import argparse, json, math, multiprocessing, sys, unicodedata
import numpy as np
import kenlm
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from score import report, confusions, logical, greedy

LN10 = math.log(10)
LM = None


def init(path):
    global LM
    LM = kenlm.Model(path)


def lse(a, b):
    if a == -math.inf:
        return b
    if b == -math.inf:
        return a
    m = max(a, b)
    return m + math.log1p(math.exp(-abs(a - b)))


def decode(p, labels, alpha, beta, beam, topk=6):
    lp = np.log(p.astype(np.float32) + 1e-9)
    s0 = kenlm.State()
    LM.BeginSentenceWrite(s0)
    # prefix -> [p_blank, p_nonblank, lm_logprob, lm_state]
    beams = {(): [0.0, -math.inf, 0.0, s0]}
    for t in range(lp.shape[0]):
        row = lp[t]
        if row[0] > -0.001:  # blank-only frame: just carry the beams over
            for b in beams.values():
                b[0], b[1] = lse(b[0], b[1]) + row[0], -math.inf
            continue
        cands = [c for c in np.argsort(-row)[:topk] if c != 0]
        new = {}
        for pre, (pb, pnb, lm, st) in beams.items():
            tot = lse(pb, pnb)
            e = new.setdefault(pre, [-math.inf, -math.inf, lm, st])
            e[0] = lse(e[0], tot + row[0])
            if pre:
                e[1] = lse(e[1], pnb + row[pre[-1]])
            for c in cands:
                c = int(c)
                npre = pre + (c,)
                if pre and pre[-1] == c:
                    add = pb + row[c]  # a repeat needs a blank between
                else:
                    add = tot + row[c]
                if npre not in new:
                    tok = '|' if labels[c] == ' ' else labels[c]
                    ns = kenlm.State()
                    sc = LM.BaseScore(st, tok, ns) * LN10
                    new[npre] = [-math.inf, -math.inf, lm + sc, ns]
                new[npre][1] = lse(new[npre][1], add)
        beams = dict(sorted(new.items(), key=lambda kv: -(lse(kv[1][0], kv[1][1]) + alpha * kv[1][2] + beta * len(kv[0])))[:beam])
    best = max(beams.items(), key=lambda kv: lse(kv[1][0], kv[1][1]) + alpha * kv[1][2] + beta * len(kv[0])
               + alpha * LM.BaseScore(kv[1][3], '</s>', kenlm.State()) * LN10)
    return ''.join(labels[c] for c in best[0])


ARGS = None


def one(p):
    return decode(p, *ARGS)


def run(probs, labels, lm, alpha, beta, beam, procs=4):
    global ARGS
    ARGS = (labels, alpha, beta, beam)
    with multiprocessing.Pool(procs, initializer=init, initargs=(lm,)) as pool:
        vis = pool.map(one, probs, chunksize=10)
    return [unicodedata.normalize('NFD', logical(v).strip()) for v in vis]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('npz')
    ap.add_argument('--lm', default='lm/chars6.bin')
    ap.add_argument('--alpha', type=float, default=0.3)
    ap.add_argument('--beta', type=float, default=0.5)
    ap.add_argument('--beam', type=int, default=16)
    ap.add_argument('--sweep', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    d = np.load(a.npz, allow_pickle=True)
    n = a.limit or len(d['gts'])
    nfd = lambda t: unicodedata.normalize('NFD', t)
    gts, paths, probs = [nfd(g) for g in d['gts'][:n]], list(d['paths'][:n]), list(d['probs'][:n])
    labels = [str(l) if (l or i == 0) else chr(0xE000 + i) for i, l in enumerate(d['labels'])]
    base = [nfd(logical(greedy(p, labels)).strip()) for p in probs]
    print(json.dumps(report('greedy', gts, base, paths), ensure_ascii=False), flush=True)
    grid = [(x, y) for x in (0.1, 0.2, 0.3, 0.5) for y in (0.0, 0.5, 1.0)] if a.sweep else [(a.alpha, a.beta)]
    for alpha, beta in grid:
        hyp = run(probs, labels, a.lm, alpha, beta, a.beam)
        r = report(f'char6 a={alpha} b={beta}', gts, hyp, paths)
        r['fixed'] = sum(b != g and h == g for g, b, h in zip(gts, base, hyp))
        r['broken'] = sum(b == g and h != g for g, b, h in zip(gts, base, hyp))
        print(json.dumps(r, ensure_ascii=False), flush=True)
