"""Score a reading (from evalx.py) the way the work needs it, not as one number:
letters and words, by line kind (body, notes), and which mistakes the model
makes most (ש read as 70, „ read as ", a lost makaf). With --lm it also
re-decides each line with a word model built from the typed volumes 30-38
(never 39, which the test lines come from) and shows what that changes.

    score.py <reading.npz> [--lm lm/vis4.bin --alpha A --beta B --beam 32]
    score.py <reading.npz> --lm lm/vis4.bin --sweep     # try weights (dev only)"""
import argparse, collections, json, multiprocessing, re, sys, unicodedata
import numpy as np
from rapidfuzz.distance import Levenshtein
from kraken.lib.bidi import get_display_map

NIKUD = re.compile('[ְ-ׇ]')


def kind(ch):
    if ch == ' ':
        return 'space'
    if NIKUD.match(ch):
        return 'nikud'
    if 'א' <= ch <= 'ת':
        return 'final' if ch in 'ךםןףץ' else 'letter'
    if ch.isdigit():
        return 'digit'
    if ch in '„"\'״׳,':
        return 'quote'
    if ch in '\u05be-':
        return 'makaf'
    return 'punct'


def logical(vis):
    return get_display_map(vis, 'R')[0] if vis else vis


def greedy(p, labels):
    best = p.argmax(1)
    out, prev = [], 0
    for b in best:
        if b != prev and b != 0:
            out.append(labels[b])
        prev = b
    return ''.join(out)


def report(name, gts, hyps, paths):
    ce = sum(Levenshtein.distance(g, h) for g, h in zip(gts, hyps))
    cn = sum(len(g) for g in gts)
    we = sum(Levenshtein.distance(g.split(), h.split()) for g, h in zip(gts, hyps))
    wn = sum(len(g.split()) for g in gts)
    by = collections.defaultdict(lambda: [0, 0, 0, 0])
    for g, h, p in zip(gts, hyps, paths):
        k = 'notes' if '_n' in p.rsplit('/', 1)[-1] else 'body'
        r = by[k]
        r[0] += Levenshtein.distance(g, h); r[1] += len(g)
        r[2] += Levenshtein.distance(g.split(), h.split()); r[3] += len(g.split())
    out = {'name': name, 'lines': len(gts), 'char_acc': round(100 * (1 - ce / cn), 2), 'word_acc': round(100 * (1 - we / wn), 2),
           'lines_perfect': round(100 * sum(g == h for g, h in zip(gts, hyps)) / len(gts), 1)}
    for k, r in sorted(by.items()):
        out[k] = {'char_acc': round(100 * (1 - r[0] / r[1]), 2), 'word_acc': round(100 * (1 - r[2] / r[3]), 2)}
    return out


def confusions(gts, hyps, top=25):
    pairs, kinds = collections.Counter(), collections.Counter()
    for g, h in zip(gts, hyps):
        for op in Levenshtein.editops(g, h):
            a = g[op.src_pos] if op.tag != 'insert' else ''
            b = h[op.dest_pos] if op.tag != 'delete' else ''
            pairs[(a, b)] += 1
            kinds[kind(a or b)] += 1
    show = lambda c: '∅' if c == '' else ('␣' if c == ' ' else c)
    return {'by_kind': dict(kinds.most_common()),
            'top': [f'{show(a)}→{show(b)} {n}' for (a, b), n in pairs.most_common(top)]}


DEC = None


def init(labels, lm, alpha, beta):
    global DEC
    from pyctcdecode import build_ctcdecoder
    uni = lm.rsplit('.', 1)[0].replace('4', '') + '_unigrams.txt'
    words = [w for w in open(uni, encoding='utf-8').read().split('\n') if w]
    DEC = build_ctcdecoder(labels, kenlm_model_path=lm, unigrams=words, alpha=alpha, beta=beta)


def dec_one(args):
    p, beam = args
    return DEC.decode(np.log(p.astype(np.float32) + 1e-9), beam_width=beam)


def lm_decode(probs, labels, lm, alpha, beta, beam, procs=4):
    with multiprocessing.Pool(procs, initializer=init, initargs=(labels, lm, alpha, beta)) as pool:
        vis = pool.map(dec_one, [(p, beam) for p in probs], chunksize=20)
    return [unicodedata.normalize('NFD', logical(v).strip()) for v in vis]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('npz')
    ap.add_argument('--lm')
    ap.add_argument('--alpha', type=float, default=0.5)
    ap.add_argument('--beta', type=float, default=1.0)
    ap.add_argument('--beam', type=int, default=32)
    ap.add_argument('--sweep', action='store_true')
    ap.add_argument('--out')
    a = ap.parse_args()
    d = np.load(a.npz, allow_pickle=True)
    # Both sides in NFD, the form the new base models train in, so lanes
    # trained with and without -u NFD are scored alike.
    nfd = lambda t: unicodedata.normalize('NFD', t)
    gts, preds, paths, probs = [nfd(g) for g in d['gts']], [nfd(p) for p in d['preds']], list(d['paths']), list(d['probs'])
    # Labels the codec can't give as one character get a private stand-in so
    # the decoder's alphabet stays unique; they never match a word anyway.
    labels = [l if (l or i == 0) else chr(0xE000 + i) for i, l in enumerate(d['labels'])]
    mine = [nfd(logical(greedy(p, labels)).strip()) for p in probs]
    same = sum(m == p for m, p in zip(mine, preds))
    print(f'greedy check: {same}/{len(preds)} lines match Kraken\'s own reading', file=sys.stderr)
    res = {'greedy': report('greedy', gts, preds, paths), 'greedy_errors': confusions(gts, preds)}
    if a.lm and a.sweep:
        for alpha in (0.2, 0.4, 0.6, 0.8):
            for beta in (0.0, 1.0, 2.0):
                hyp = lm_decode(probs, labels, a.lm, alpha, beta, a.beam)
                r = report(f'lm a={alpha} b={beta}', gts, hyp, paths)
                print(json.dumps(r, ensure_ascii=False), flush=True)
        sys.exit()
    if a.lm:
        hyp = lm_decode(probs, labels, a.lm, a.alpha, a.beta, a.beam)
        res['lm'] = report(f'lm a={a.alpha} b={a.beta} beam={a.beam}', gts, hyp, paths)
        res['lm_errors'] = confusions(gts, hyp)
        fixed = sum(p != g and h == g for g, p, h in zip(gts, preds, hyp))
        broke = sum(p == g and h != g for g, p, h in zip(gts, preds, hyp))
        res['lm_lines'] = {'fixed': fixed, 'broken': broke}
        if a.out:
            with open(a.out, 'w') as f:
                for g, p, h, pa in zip(gts, preds, hyp, paths):
                    if p != h:
                        f.write(f'{pa}\nGT  {g}\nOLD {p}\nLM  {h}\n\n')
    print(json.dumps(res, ensure_ascii=False, indent=1))
