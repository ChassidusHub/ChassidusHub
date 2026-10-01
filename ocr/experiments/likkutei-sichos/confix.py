"""Second opinion on look-alike letters, from the words. The network tells
ב from כ, ת from ח and ז from ן by the shape alone, and a few times in a
thousand the shape is not enough (אלקוח, נכרא, זכחים). A reader knows the
word and the phrase. So, for each word the model read:

- single swaps of a look-alike letter the network also gave some weight to
  at that frame are the candidates;
- a word that is not known, but a candidate is: the commonest candidate wins;
- a word that is known, but a candidate is known too (איז/אין, ב"ה/כ"ה):
  the word model decides, and only when the phrase with the candidate is
  far more likely (--margin, in log10) than the phrase as read.

Nothing else is touched, so unlike a full word-model decode this cannot
wander off into inserting words.

    confix.py <reading.npz> <vocab counts.txt> [--lm words.bin --margin 2
        --min-prob 1e-3 --min-count 3 --out changes.txt]

counts.txt: "word count" per line, logical order, NFD; a word keeps its
inner gershayim and geresh (ת"ל, שכ')."""
import argparse, json, re, sys, unicodedata
import numpy as np
from rapidfuzz.distance import Levenshtein
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from score import report
from kraken.lib.bidi import get_display_map

nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
PAIRS = {'ב': 'כ', 'כ': 'ב', 'ת': 'ח', 'ח': 'תה', 'ז': 'ןו', 'ן': 'זו', 'ו': 'ןז', 'ד': 'ר', 'ר': 'ד', 'ה': 'ח',
         'ם': 'ס', 'ס': 'ם', 'ג': 'נ', 'נ': 'ג', 'י': 'ו', 'ט': 'ם', 'צ': 'ע', 'ע': 'צ', 'פ': 'ם', 'ץ': 'ף'}
EDGE = re.compile(r'^[^א-ת]+|[^א-ת]+$')
WORD = re.compile(r'[א-ת"\'׳״]+')


def key(w):
    """The word as the vocabulary knows it: letters with their inner gershayim."""
    w = EDGE.sub('', w)
    return w if WORD.fullmatch(w) else ''


def read_frames(p, labels):
    """Letters of the greedy reading in visual order, each with its frame."""
    best = p.argmax(1); out, prev = [], 0
    for t, b in enumerate(best):
        if b != 0 and b != prev:
            out.append((labels[b], t))
        prev = b
    return out


class Fixer:
    def __init__(self, vocab, idx, lm=None, margin=2.0, min_prob=1e-3, min_count=3, phrase_min_prob=3e-3):
        self.vocab, self.idx, self.lm, self.margin, self.min_prob, self.min_count = vocab, idx, lm, margin, min_prob, min_count
        # a swap between two real words needs more of the network's weight, since
        # the word model is mostly Hebrew and would turn Yiddish ביים into ביום
        self.phrase_min_prob = phrase_min_prob

    def phrase(self, toks):
        return self.lm.score(' '.join(toks), bos=True, eos=True) if self.lm else 0.0

    def line(self, p, labels):
        fr = read_frames(p, labels)
        vis = ''.join(c for c, _ in fr)
        if not vis:
            return '', '', []
        log, order = get_display_map(vis, 'R')  # order[k] = visual index of logical char k
        frames = [fr[order[k]][1] for k in range(len(log))]
        chars = list(log); changes = []
        words = list(re.finditer(r'\S+', log))
        toks = [key(m.group()) for m in words]
        for wi, m in enumerate(words):
            w = toks[wi]
            # a word cut at the line's end by a makaf (תהיי־) is only a piece of a word
            if len(w) < 2 or (wi == len(words) - 1 and m.group().endswith('־')) or (wi == 0 and m.group().startswith('־')):
                continue
            known = self.vocab.get(w, 0) >= self.min_count
            base = self.phrase(toks) if known and self.lm else None
            best = None
            for k in range(m.start(), m.end()):
                c = log[k]
                if c not in PAIRS:
                    continue
                for alt in PAIRS[c]:
                    if alt not in self.idx:
                        continue
                    cand = key(log[m.start():k] + alt + log[k + 1:m.end()])
                    n = self.vocab.get(cand, 0)
                    if n < self.min_count:
                        continue
                    t = frames[k]; pr = float(p[max(0, t - 1):t + 2, self.idx[alt]].max())
                    if pr < self.min_prob:
                        continue
                    if known:
                        if not self.lm or pr < self.phrase_min_prob:
                            continue
                        gain = self.phrase(toks[:wi] + [cand] + toks[wi + 1:]) - base
                        if gain < self.margin:
                            continue
                        score = gain
                    else:
                        score = n
                    if best is None or score > best[3]:
                        best = (k, alt, n, score, pr)
            if best:
                k, alt, n, score, pr = best
                chars[k] = alt
                changes.append((m.group(), alt, n, score, pr, 'phrase' if known else 'word'))
        return nfd(log), nfd(''.join(chars)), changes


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('npz'); ap.add_argument('vocab')
    ap.add_argument('--lm'); ap.add_argument('--margin', type=float, default=2.0)
    ap.add_argument('--min-prob', type=float, default=1e-3)
    ap.add_argument('--min-count', type=int, default=3)
    ap.add_argument('--phrase-min-prob', type=float, default=3e-3)
    ap.add_argument('--out')
    a = ap.parse_args()
    vocab = {}
    for l in open(a.vocab, encoding='utf-8'):
        w, n = l.rsplit(' ', 1); vocab[w] = int(n)
    lm = None
    if a.lm:
        import kenlm
        lm = kenlm.Model(a.lm)
    d = np.load(a.npz, allow_pickle=True)
    labels = [str(l) if (l or i == 0) else chr(0xE000 + i) for i, l in enumerate(d['labels'])]
    idx = {l: i for i, l in enumerate(labels)}
    fx = Fixer(vocab, idx, lm, a.margin, a.min_prob, a.min_count, a.phrase_min_prob)
    gts = [nfd(g) for g in d['gts']]; paths = [str(p) for p in d['paths']]
    old, new, fixed, broke, rows = [], [], 0, 0, []
    for g, p, path in zip(gts, d['probs'], paths):
        o, n, ch = fx.line(p, labels)
        old.append(o); new.append(n)
        if ch:
            was = Levenshtein.distance(g, o); now = Levenshtein.distance(g, n)
            fixed += now < was; broke += now > was
            rows.append((path, 'better' if now < was else 'worse' if now > was else 'same', o, n, ch))
    print(json.dumps({'before': report('greedy', gts, old, paths), 'after': report('confix', gts, new, paths),
                      'lines_fixed': fixed, 'lines_broken': broke, 'changed': len(rows)}, ensure_ascii=False))
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            for path, verdict, o, n, ch in rows:
                f.write(f'{path} {verdict}\nOLD {o}\nNEW {n}\n' + ' '.join(f'{c[0]}→{c[1]}({c[5]} {c[2]} {c[3]:.2f} p{c[4]:.3f})' for c in ch) + '\n\n')
