"""Two readers, one line: where the 96 px and the 128 px readers (round 3) read a
line differently, the reading whose words a reader of Chabad print knows wins.
Each word is looked up without its points (confix.key, the library's vocabulary
from corpus.py), and a reading scores the fewest unknown words, then the word
model's phrase score; a tie keeps the first reader. Lines they still disagree on
are listed for a person (--flags), since that is where a misread hides.

    vote.py <first.npz> <second.npz> <vocab counts.txt> <out.npz> [--lm words.bin --flags out.txt]

out.npz has evalx's fields (paths, gts, preds), so gate.py and cmp4500.py score it."""
import argparse, re, unicodedata
import numpy as np
import confix

nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
POINTS = re.compile('[֑-ׇ]')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('vocab'); ap.add_argument('out')
    ap.add_argument('--lm'); ap.add_argument('--flags')
    a = ap.parse_args()
    vocab = {}
    for l in open(a.vocab, encoding='utf-8'):
        w, n = l.rsplit(' ', 1); vocab[POINTS.sub('', w)] = vocab.get(POINTS.sub('', w), 0) + int(n)
    lm = None
    if a.lm:
        import kenlm
        lm = kenlm.Model(a.lm)
    A, B = (np.load(f, allow_pickle=True) for f in (a.a, a.b))
    bpred = {str(p): nfd(h) for p, h in zip(B['paths'], B['preds'])}

    def score(text):
        words = [confix.key(POINTS.sub('', w)) for w in text.split()]
        unknown = sum(1 for w in words if w and vocab.get(w, 0) < 3)
        phrase = lm.score(' '.join(w for w in words if w), bos=False, eos=False) if lm else 0.0
        return (-unknown, phrase)

    preds, flags, took_b = [], [], 0
    for p, h in zip(A['paths'], A['preds']):
        h, o = nfd(h), bpred.get(str(p), nfd(h))
        if h == o:
            preds.append(h); continue
        sa, sb = score(h), score(o)
        if sb > sa:
            preds.append(o); took_b += 1
        else:
            preds.append(h)
        if sa[0] == sb[0]:
            flags.append(f'{p}\n  {h}\n  {o}\n')
    np.savez(a.out, paths=A['paths'], gts=A['gts'], preds=np.array(preds))
    print(f'{len(preds)} lines, {sum(nfd(x) != bpred.get(str(p), nfd(x)) for p, x in zip(A["paths"], A["preds"]))} read differently, '
          f'second reader taken on {took_b}, {len(flags)} left for a person')
    if a.flags:
        open(a.flags, 'w', encoding='utf-8').write('\n'.join(flags))


if __name__ == '__main__':
    main()
