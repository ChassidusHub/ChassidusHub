"""Is a new reader better than the one in use on every kind of mistake, not only
on the total? (Shmuly 2026-10-02: raise the accuracy and lower the error rate of
every kind, mastering Hebrew and Yiddish both.) Rounds 1 and 2 of the Yiddish
training were better on Yiddish and worse on Hebrew line-opening dashes, which
a single total hides; this counts each kind apart, on both tests.

Hebrew: the 4,500 vol 39 lines, against the checked labels of the keeper's final
test (ev/final/focus_full.npz, as cmp4500.py). Yiddish: the vol 25 lines and fake
lines (yid/dev.txt). A reading is an evalx npz holding both tests, or two joined
with + (heb.npz+yid.npz).

    gate.py <keeper hebrew npz> <keeper yiddish npz> <candidate npz>... [--fixes test4500_fixes.json]

--fixes: Hebrew test labels corrected by eye against the scans ({"fixes": {path: text}});
on 2026-10-04, 73 of the 116 lines the two-reader vote got "wrong" were wrong labels.

A candidate passes when no kind has more mistakes than the keeper's, allowing
5% or 2 mistakes, whichever is more, for chance."""
import json, re, sys, unicodedata
import numpy as np
from rapidfuzz.distance import Levenshtein

nfd = lambda t: unicodedata.normalize('NFD', str(t))
HARD = {frozenset('בכ'), frozenset('תח'), frozenset('זן'), frozenset('זו'), frozenset('ןו')}
POINT = re.compile('[\u0591-\u05bd\u05bf-\u05c7]')  # the points, not the maqaf (U+05BE) between them
MARK = re.compile(r'\*{0,3}\d{1,3}\)|\*{1,3}\)')
EDGE = re.compile(r'^(— |\. \. \. )|( —)$')


def load(fn):
    """Readings and labels by line; a+b.npz joins two readings of one model."""
    preds, gts = {}, {}
    for f in fn.split('+'):
        d = np.load(f, allow_pickle=True)
        preds.update({str(p): nfd(h) for p, h in zip(d['paths'], d['preds'])})
        gts.update({str(p): nfd(g) for p, g in zip(d['paths'], d['gts'])})
    return preds, gts


def kinds(pairs):
    """Mistakes of each kind over (path, label, reading) rows."""
    k = dict.fromkeys(['letters', 'words', 'lines', 'body', 'notes', 'dash', 'dots', 'note marks', 'stars', 'look-alike', 'points'], 0)
    n = dict(letters=0, words=0, lines=0)
    for p, g, h in pairs:
        e = Levenshtein.distance(g, h)
        k['letters'] += e; n['letters'] += len(g)
        k['words'] += Levenshtein.distance(g.split(), h.split()); n['words'] += len(g.split())
        k['lines'] += g != h; n['lines'] += 1
        k['notes' if re.search(r'_n\d+\.png$', p) else 'body'] += e
        k['dash'] += abs(g.count('—') - h.count('—'))
        k['dots'] += abs(g.count('. .') - h.count('. .'))
        k['note marks'] += len(set(MARK.findall(g)) ^ set(MARK.findall(h)))
        k['stars'] += abs(g.count('*') - h.count('*'))
        k['points'] += Levenshtein.distance(''.join(POINT.findall(g)), ''.join(POINT.findall(h)))
        for op in Levenshtein.editops(g, h):
            if op.tag == 'replace' and frozenset((g[op.src_pos], h[op.dest_pos])) in HARD:
                k['look-alike'] += 1
    return k, n


def hebrew_rows(ref_fn, fn):
    ref_p, ref_g = load(ref_fn)
    gts = {}
    for p, g in ref_g.items():  # the keeper's checked labels: edge marks it read that the typed text lacked
        h = ref_p[p]
        gts[p] = h if g != h and EDGE.sub('', h) == EDGE.sub('', g) and len(h) > len(g) else g
        gts[p] = nfd(FIXES.get(p, gts[p]))
    preds, _ = load(fn)
    return [(p, g, preds.get(p, '')) for p, g in gts.items()]


def yiddish_rows(ref_fn, fn):
    # the same line under another folder (read here or on a pod): matched by its last two parts
    tail = lambda p: '/'.join(p.split('/')[-2:])
    _, gts = load(ref_fn)
    preds = {tail(p): h for p, h in load(fn)[0].items() if 'yid' in p}
    return [(p, g, preds.get(tail(p), '')) for p, g in gts.items() if 'yid' in p]


FIXES = {}


def main():
    global FIXES
    if '--fixes' in sys.argv:
        k = sys.argv.index('--fixes'); FIXES = json.load(open(sys.argv[k + 1]))['fixes']; del sys.argv[k:k + 2]
    heb_ref, yid_ref, cands = sys.argv[1], sys.argv[2], sys.argv[3:]
    tests = [('Hebrew', lambda fn: hebrew_rows(heb_ref, fn), heb_ref), ('Yiddish', lambda fn: yiddish_rows(yid_ref, fn), yid_ref)]
    verdict = {c: True for c in cands}
    for name, rows, ref in tests:
        base, n = kinds(rows(ref))
        print(f'\n{name} ({n["lines"]} lines): mistakes of each kind, keeper first')
        print('| Reader | ' + ' | '.join(base) + ' |'); print('|---' * (len(base) + 1) + '|')
        print('| keeper | ' + ' | '.join(str(v) for v in base.values()) + ' |')
        for c in cands:
            got, _ = kinds(rows(c))
            cells = []
            for kk, v in got.items():
                worse = v > max(base[kk] * 1.05, base[kk] + 2)
                verdict[c] &= not worse
                cells.append(f'**{v}**' if worse else str(v))
            print(f'| {c.split("/")[-1]} | ' + ' | '.join(cells) + ' |')
        print(f'letters right: keeper {100 - 100 * base["letters"] / n["letters"]:.2f}%, words {100 - 100 * base["words"] / n["words"]:.2f}%')
    print()
    for c, ok in verdict.items():
        print(c, 'PASSES: no kind worse' if ok else 'FAILS: a kind is worse (bold above)')


if __name__ == '__main__':
    main()
