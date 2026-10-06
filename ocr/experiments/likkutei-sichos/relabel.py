"""Fix the typed text of training lines where the scan shows it is wrong, using
a strong model's reading of each line. The typed text came from the Chabad
Library and was matched to the printed lines by pairs.py; two things there
go wrong, and both look the same from the model's side:

- a word broken across two lines at a makaf (תומכי־תמימים) is typed whole on
  one of the two lines, so one label has an extra word at its edge and the
  other misses one;
- a footnote mark ("359)") is in the typed text but not printed on the line.

Only those kinds of differences are taken from the reading, and only where
the model is sure of the letters it read there. Every other difference keeps
the typed text, since there the model may be the one that is wrong.

    relabel.py <reading.npz> <out.tsv> [--conf 0.9] [--write]

out.tsv lists path, old label, new label, rule for each changed line; with
--write the .gt.txt files are rewritten (the old text kept as .gt.orig.txt)."""
import argparse, difflib, os, re, sys, unicodedata
import numpy as np
from kraken.lib.bidi import get_display_map

nfd = lambda t: unicodedata.normalize('NFD', str(t))
NOTE = re.compile(r'^(.*?)((?:\*{0,3}\d*\))+)$')


def reading(p, labels):
    """The greedy reading of one line in logical order, with how sure the
    model was of each letter (the peak probability of its frames)."""
    best, top = p.argmax(1), p.max(1).astype(np.float32)
    chars, conf, prev = [], [], 0
    for t, b in enumerate(best):
        if b != 0 and b != prev:
            chars.append(labels[b]); conf.append(top[t])
        elif b != 0 and chars:
            conf[-1] = max(conf[-1], top[t])
        prev = b
    vis = ''.join(chars)
    if not vis:
        return '', []
    log, order = get_display_map(vis, 'R')
    lc = [conf[order[k]] for k in range(len(log))]
    # NFD letter by letter so each letter keeps its own confidence
    text, cs = '', []
    for ch, c in zip(log, lc):
        n = nfd(ch)
        text += n; cs += [c] * len(n)
    if nfd(text) != text:
        return nfd(text), [min(lc)] * len(nfd(text))
    # trim spaces at both ends, as the labels are trimmed
    a = len(text) - len(text.lstrip()); b = len(text.rstrip())
    return text[a:b], cs[a:b]


def words_conf(text, cs):
    out, i = [], 0
    for w in text.split(' '):
        out.append((w, min(cs[i:i + len(w)]) if w else 1.0))
        i += len(w) + 1
    return out


LETTERS = re.compile(r'[\u05d0-\u05ea]+')
MARK = re.compile(r'\*{0,3}\d+\)')


def bare(ws):
    return ''.join(LETTERS.findall(' '.join(ws)))


def confirmed(added, kept, start, prev, nxt, prev_gt, next_gt):
    """An edge addition the model read without much confidence is taken only
    when the neighbouring line, typed or read, carries the same letters at the
    touching edge (the word was typed there, or printed broken across both).
    A low-confidence reading alone once turned תומכי־תמימים into תומכתמימים."""
    extra = added[:len(added) - len(kept)] if start else added[len(kept):]
    if len(extra) < 2:
        return False
    near = [bare(t.split()[-2:]) for t in (prev, prev_gt)] if start else [bare(t.split()[:2]) for t in (nxt, next_gt)]
    return any(n.endswith(extra) if start else n.startswith(extra) for n in near if n)


def fix(gt, text, cs, prev='', nxt='', conf=0.9, low=0.5, sure_add=0.8, prev_gt='', next_gt=''):
    """The corrected label and the rule used, or (gt, None). prev and nxt are
    the model's readings of the lines above and below, when known.

    What the scans showed (vol 39 check lines): where the reading has a word
    or mark at a line edge that the typed text lacks, the reading was right
    (תומכי־ at a makaf break, a dash, ל־); where the reading drops something
    at an edge (a final period, ". . ."), the model was the one wrong. So
    edge additions are taken, edge drops only when the word shows up at the
    touching edge of the neighbouring line's reading."""
    G, R = gt.split(), [w for w in words_conf(text, cs) if w[0]]
    if not G or not R or gt == text:
        return gt, None
    sm = difflib.SequenceMatcher(None, G, [w for w, _ in R], autojunk=False)
    ops = sm.get_opcodes()
    same = sum(i2 - i1 for t, i1, i2, _, _ in ops if t == 'equal')
    if same < 0.6 * len(G):
        return gt, None
    out, rules = [], []
    for t, i1, i2, j1, j2 in ops:
        if t == 'equal':
            out += G[i1:i2]
            continue
        g, r = G[i1:i2], R[j1:j2]
        rw = [w for w, _ in r]
        lo = min((c for _, c in r), default=1.0)
        start, end = i1 == 0 and j1 == 0, i2 == len(G) and j2 == len(R)
        if len(g) == len(r) and all(MARK.sub('', a) == b and a != b for a, b in zip(g, rw)) and lo >= conf:
            out += rw; rules.append('note-mark')  # a mark typed but not printed
        elif start and len(g) == len(r) == 1 and g[0].startswith(')') and re.fullmatch(r'\*{0,3}\d+\)' + re.escape(g[0][1:]), rw[0]) and lo >= low:
            # a footnote's own number, printed "40)" but missing from the typed text
            # (1,058 such labels in vols 30-39); a model trained on those labels
            # reads the number with little confidence, so the bar is low here
            out += rw; rules.append('note-number')
        elif (start or end) and rw and len(rw) <= 2 and lo >= low and (not g or (
                bare(g) and bare(rw) != bare(g) and (bare(rw).endswith(bare(g)) if start else bare(rw).startswith(bare(g))))) and (
                lo >= sure_add or confirmed(bare(rw), bare(g), start, prev, nxt, prev_gt, next_gt)):
            out += rw; rules.append('edge-add')  # the print has more at the edge
        elif (start or end) and not r and len(g) <= 2 and bare(g) and (
                (start and bare(prev.split()[-len(g):]) == bare(g)) or (end and bare(nxt.split()[:len(g)]) == bare(g))):
            rules.append('edge-moved')  # typed here, printed on the next/previous line
        else:
            out += g
    new = ' '.join(out)
    return (new, '+'.join(sorted(set(rules)))) if new != gt and rules else (gt, None)


def apply(read, gts, out, conf=0.9, write=False):
    """read: path -> (text, confidences); gts: path -> typed label. Writes the
    changed lines to out (tsv) and, with write, the new .gt.txt files."""
    def near(path, k):
        m = re.match(r'(.*_[bn])(\d+)(\.png)$', path)
        return read.get(f'{m.group(1)}{int(m.group(2)) + k:0{len(m.group(2))}d}{m.group(3)}', ('', []))[0] if m else ''

    def near_gt(path, k):
        m = re.match(r'(.*_[bn])(\d+)(\.png)$', path)
        return gts.get(f'{m.group(1)}{int(m.group(2)) + k:0{len(m.group(2))}d}{m.group(3)}', '') if m else ''

    n, rules = 0, {}
    with open(out, 'w') as f:
        for path, gt in gts.items():
            if path not in read:
                continue
            text, cs = read[path]
            new, rule = fix(gt, text, cs, near(path, -1), near(path, 1), conf,
                            prev_gt=near_gt(path, -1), next_gt=near_gt(path, 1))
            if rule:
                n += 1; rules[rule] = rules.get(rule, 0) + 1
                f.write(f'{path}\t{gt}\t{new}\t{rule}\n')
                if write:
                    g = path.rsplit('.', 1)[0]
                    if not os.path.exists(g + '.gt.orig.txt'):
                        os.replace(g + '.gt.txt', g + '.gt.orig.txt')
                    open(g + '.gt.txt', 'w', encoding='utf-8').write(new + '\n')
    return n, rules


def typed(path):
    """The typed label as pairs.py made it (the original, if already fixed)."""
    g = path.rsplit('.', 1)[0]
    f = g + '.gt.orig.txt' if os.path.exists(g + '.gt.orig.txt') else g + '.gt.txt'
    return nfd(open(f, encoding='utf-8').read()).strip()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src', help='a reading .npz, or a glob of relabel_read.py .jsonl files')
    ap.add_argument('out')
    ap.add_argument('--conf', type=float, default=0.9)
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    if a.src.endswith('.npz'):
        d = np.load(a.src, allow_pickle=True)
        labels = [str(l) if (l or i == 0) else chr(0xE000 + i) for i, l in enumerate(d['labels'])]
        read = {str(path): reading(p, labels) for path, p in zip(d['paths'], d['probs'])}
        gts = {str(path): nfd(gt).strip() for path, gt in zip(d['paths'], d['gts'])}
    else:
        import glob, json
        read = {}
        for fn in sorted(glob.glob(a.src)):
            for l in open(fn, encoding='utf-8'):
                r = json.loads(l); read[r['p']] = (r['t'], r['c'])
        gts = {p: typed(p) for p in read}
    n, rules = apply(read, gts, a.out, a.conf, a.write)
    print(f'{n} of {len(gts)} labels changed {rules}', flush=True)
