"""Two readers, one line: where the 96 px and the 128 px readers (round 3) read a
line differently, the reading whose words a reader of Chabad print knows wins.
Each word is looked up without its points (confix.key, the library's vocabulary
from corpus.py), and a reading scores the fewest unknown words, then the word
model's phrase score; a tie keeps the first reader. Lines they still disagree on
are listed for a person (--flags), since that is where a misread hides.

    vote.py <first.npz> <second.npz> <vocab counts.txt> <out.npz> [--lm words.bin --flags out.txt]

out.npz has evalx's fields (paths, gts, preds), so gate.py and cmp4500.py score it."""
import argparse, re, sys, unicodedata
import numpy as np
import confix

nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
POINTS = re.compile('[֑-ׇ]')


class Chooser:
    """Picks between two readings of one line: fewer unknown words, then the better
    phrase score; a tie keeps the first. Without kenlm (a pod that could not build it)
    the phrase score is left out, which costs a little (194 Hebrew mistakes, not 187)."""

    def __init__(self, vocab, lm=None):
        self.vocab = {}
        for l in open(vocab, encoding='utf-8'):
            w, n = l.rsplit(' ', 1); k = POINTS.sub('', w)
            self.vocab[k] = self.vocab.get(k, 0) + int(n)
        self.lm = None
        if lm:
            try:
                import kenlm
                self.lm = kenlm.Model(lm)
            except Exception as e:
                print('vote: no phrase score:', e, file=sys.stderr)

    def score(self, text):
        words = [confix.key(POINTS.sub('', w)) for w in text.split()]
        unknown = sum(1 for w in words if w and self.vocab.get(w, 0) < 3)
        phrase = self.lm.score(' '.join(w for w in words if w), bos=False, eos=False) if self.lm else 0.0
        return (-unknown, phrase)

    def pick(self, first, second):
        """(0 or 1 for the reading taken, True when the word check could not tell them apart)."""
        if first == second:
            return 0, False
        # Same letters, different points: the one with more points. A reader drops a
        # point far more often than it makes one up, and the round 3 reader learned
        # bare spellings (דאך, נאך, פ without dagesh) from the library's Yiddish, where
        # the print has דאָך, נאָך, פּ (checked on vol 15 and vol 25 scans, 2026-10-02).
        pa, pb = POINTS.findall(first), POINTS.findall(second)
        if POINTS.sub('', first) == POINTS.sub('', second):
            return (1 if len(pb) > len(pa) else 0), len(pa) == len(pb)
        sa, sb = self.score(first), self.score(second)
        return (1 if sb > sa else 0), sa[0] == sb[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('vocab'); ap.add_argument('out')
    ap.add_argument('--lm'); ap.add_argument('--flags')
    a = ap.parse_args()
    ch = Chooser(a.vocab, a.lm)
    A, B = (np.load(f, allow_pickle=True) for f in (a.a, a.b))
    bpred = {str(p): nfd(h) for p, h in zip(B['paths'], B['preds'])}
    preds, flags, took_b = [], [], 0
    for p, h in zip(A['paths'], A['preds']):
        h = nfd(h); o = bpred.get(str(p), h)
        which, tie = ch.pick(h, o)
        preds.append(o if which else h); took_b += which
        if tie:
            flags.append(f'{p}\n  {h}\n  {o}\n')
    np.savez(a.out, paths=A['paths'], gts=A['gts'], preds=np.array(preds))
    print(f'{len(preds)} lines, {sum(nfd(x) != bpred.get(str(p), nfd(x)) for p, x in zip(A["paths"], A["preds"]))} read differently, '
          f'second reader taken on {took_b}, {len(flags)} left for a person')
    if a.flags:
        open(a.flags, 'w', encoding='utf-8').write('\n'.join(flags))


if __name__ == '__main__':
    main()
