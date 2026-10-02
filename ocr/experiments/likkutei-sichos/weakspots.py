"""Where the reader is weak on volumes with no typed text (vols 15-29): every read
word is checked against the library's vocabulary and the reader's own confidence.
A word that is unknown, or read with low confidence, is a suspect; for each one the
nearest known word one letter away (by the vocabulary's counts) is the likely right
reading, and the letter swap between them is counted. The table of swaps shows
which mistakes matter most on these volumes, without any truth to compare with.

python3 weakspots.py VOCAB DIR [DIR ...]  (DIR holds lay/*.json from readsicha.py)
writes weakspots.json beside the first DIR's parent and prints the top swaps."""
import collections, glob, json, os, re, sys

HEB = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת'
PREFIX = 'ובדהכלמש'
POINTS = '\u05b0\u05b1\u05b2\u05b3\u05b4\u05b5\u05b6\u05b7\u05b8\u05b9\u05bb\u05bc\u05bf\u05c1\u05c2'
FINAL = dict(zip('כמנפצ', 'ךםןףץ'))


def load_vocab(path):
    v = {}
    for line in open(path, encoding='utf-8'):
        w, n = line.rsplit(' ', 1)
        v[w] = int(n)
    return v


def core(w):
    """The word's letters and inner quotes, without a mark, bracket or point around it."""
    w = re.sub(r'\*{0,3}\d{0,3}\)$', '', w)
    return re.sub(r'^[^א-ת]+|[^א-ת"\'׳״]+$', '', w).replace('״', '"').replace('׳', "'")


def neighbours(w):
    """Words one letter away: a letter changed, dropped or added (finals kept right)."""
    for i in range(len(w)):
        for c in HEB:
            if c != w[i]:
                yield w[:i] + c + w[i + 1:], ('swap', w[i], c)
        # not an error: a prefix letter (ושיחשב is ו + שיחשב), a Yiddish point
        # (אַ, פּ), a bracket or makaf the print itself sets inside a word (ש(הביא)
        if (i == 0 and w[i] in PREFIX) or w[i] in POINTS + '()־-' or (i > 0 and w[i - 1] in PREFIX and all(c in PREFIX for c in w[:i + 1])):
            continue
        yield w[:i] + w[i + 1:], ('extra', w[i], '')
    for i in range(len(w) + 1):
        for c in HEB:
            yield w[:i] + c + w[i:], ('lost', '', c)


def fix_final(w):
    return w[:-1] + FINAL[w[-1]] if w and w[-1] in FINAL else w


def all_words(dirs):
    for d in dirs:
        for f in sorted(glob.glob(f'{d}/lay/*.json')):
            lay = json.load(open(f))
            for key in ('body', 'notes'):
                for col in lay.get(key, []):
                    for l in (col if isinstance(col, list) else [col]):
                        for wd in l.get('words', []):
                            yield os.path.basename(d.rstrip('/')), f, wd


def self_vocab(dirs, vocab):
    """Words the reader itself read sure and often: the Yiddish sichos (and names,
    abbreviations) are not in the library's Hebrew vocabulary, but a word read with
    full confidence five times or more across the volumes is a real word."""
    seen = collections.Counter()
    for _, _, wd in all_words(dirs):
        if wd.get('conf', 1) >= 0.97:
            seen[core(wd['text'])] += 1
    return {w: n for w, n in seen.items() if n >= 5}


def is_known(w, vocab):
    # an abbreviation keeps its quote (כו', רמב"ם); the vocabulary may hold it either way
    return any(vocab.get(x, 0) >= 3 for x in (w, w.rstrip("'\""), w.replace('"', '')))


def main():
    lib = load_vocab(sys.argv[1])
    dirs = sys.argv[2:]
    mine = self_vocab(dirs, lib)
    vocab = collections.Counter(lib); vocab.update(mine)
    print(f'library words {len(lib)}, read sure and often {len(mine)}')
    swaps, examples = collections.Counter(), collections.defaultdict(list)
    words = suspects = unknown = lowconf = 0
    by_vol = collections.Counter(); suspects_by_vol = collections.Counter()
    for d in dirs:
        vol = os.path.basename(d.rstrip('/'))
        for f in sorted(glob.glob(f'{d}/lay/*.json')):
            lay = json.load(open(f))
            for key in ('body', 'notes'):
                for col in lay.get(key, []):
                    for l in (col if isinstance(col, list) else [col]):
                        for wd in l.get('words', []):
                            w = core(wd['text'])
                            if len(re.sub('[^א-ת]', '', w)) < 2:
                                continue
                            words += 1; by_vol[vol] += 1
                            known = is_known(w, vocab)
                            low = wd.get('conf', 1) < 0.9
                            if known and not low:
                                continue
                            suspects += 1; suspects_by_vol[vol] += 1
                            unknown += not known; lowconf += low
                            if known:
                                continue  # low confidence on a real word: no swap to count
                            best = max(((vocab.get(fix_final(n), 0), n, kind) for n, kind in neighbours(w) if n and n[0] in HEB and n[-1] in HEB + '"\''), default=(0, None, None))
                            if best[0] >= 20:
                                swaps[best[2]] += 1
                                if len(examples[best[2]]) < 6:
                                    examples[best[2]].append(f'{w} -> {fix_final(best[1])} ({os.path.basename(f)[:-5]})')
    out = {'words': words, 'suspects': suspects, 'unknown': unknown, 'low_conf': lowconf,
           'by_volume': {v: {'words': by_vol[v], 'suspects': suspects_by_vol[v], 'rate': round(suspects_by_vol[v] / max(1, by_vol[v]), 4)} for v in sorted(by_vol)},
           'swaps': [{'kind': k[0], 'read': k[1], 'likely': k[2], 'count': n, 'examples': examples[k]} for k, n in swaps.most_common(60)]}
    json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(dirs[0])), 'weakspots.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'{words} words, {suspects} suspect ({unknown} unknown, {lowconf} low confidence)')
    for v, s in out['by_volume'].items():
        print(f'  vol {v}: {s["words"]} words, {s["rate"]:.2%} suspect')
    for s in out['swaps'][:25]:
        print(f'  {s["kind"]:5} {s["read"] or "·"} -> {s["likely"] or "·"}  {s["count"]:5}   {"; ".join(s["examples"][:3])}')


if __name__ == '__main__':
    main()
