"""Hard-example mining for the next training round. The relabel pass has the
model read every real line with a confidence per letter (out/read_*.jsonl).
A line where the model was unsure of a look-alike letter (ב כ ת ח ז ן ו below
--conf) is what it still has to learn, so such lines go into the training
list several times over (--times), real scans rather than fakes.

    mine.py 'out/read_*.jsonl' <train list in> <train list out> [--conf 0.9 --times 3 --letters בכתחזןו]"""
import argparse, glob, json

ap = argparse.ArgumentParser()
ap.add_argument('readings'); ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--conf', type=float, default=0.9); ap.add_argument('--times', type=int, default=3)
ap.add_argument('--letters', default='בכתחזןו')
ap.add_argument('--edge-times', type=int, default=3, help='a line whose label opens with a dash or dots (— / . . .), marks the typed text often lacks, goes in this many times')
ap.add_argument('--star-times', type=int, default=10, help='a line whose label holds a star mark (*) or **) notes: 95 of 35,397 note lines) goes in this many times')
a = ap.parse_args()
hard = set()
for fn in sorted(glob.glob(a.readings)):
    for l in open(fn, encoding='utf-8'):
        r = json.loads(l)
        if any(ch in a.letters and c < a.conf for ch, c in zip(r['t'], r['c'])):
            hard.add(r['p'])


def label(p):
    try:
        return open(p[:-4] + '.gt.txt', encoding='utf-8').read().strip()
    except OSError:
        return ''


def starred(p):
    # bare star marks are so rare that the model learned to drop them (vol 39 p. 161)
    return '*' in label(p)


def edged(p):
    # run 3 (2026-10-02) drifted back to dropping a line's opening dash or dots
    t = label(p)
    return t.startswith(('—', '. .')) or t.endswith('—')


n = stars = edges = 0
with open(a.out, 'w') as f:
    for l in open(a.src):
        p = l.strip()
        if not p:
            continue
        k = a.times if p in hard else 1
        if edged(p):
            k = max(k, a.edge_times); edges += 1
        if starred(p):
            k = max(k, a.star_times); stars += 1
        f.write((p + '\n') * k); n += k
print(f'{len(hard)} hard lines of the real lines, repeated {a.times}x; {edges} edge-mark lines {a.edge_times}x; {stars} star lines {a.star_times}x; {n} lines in {a.out}')
