"""Lines of text for synthetic training, from the Chabad Library's typed pages
of the volumes given (never the test volume), written as printed (pairs.printed):
chunks of a paragraph about a printed line long, some ending in a broken word.

    python3 make_texts.py <out.txt> <vol> [vol ...]"""
import glob, json, random, re, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from pairs import printed

out, vols = sys.argv[1], {int(v) for v in sys.argv[2:]}
rng = random.Random(0)
lines = []
for f in sorted(glob.glob('truth/*.json')):
    if int(f.split('/')[-1].split('_')[0]) not in vols:
        continue
    t = json.load(open(f))
    paras = t['body'].split('\n') + [f'{m}) {x}' for m, x in t['notes'].items()]
    for p in paras:
        words = [printed(w) for w in p.replace('­', '').split()]
        i = 0
        while i < len(words):
            n = rng.randint(4, 9)
            chunk = words[i:i + n]
            i += n
            if chunk and i < len(words) and rng.random() < 0.15 and len(words[i]) > 3:
                k = rng.randint(1, len(words[i]) - 2)  # a word broken at the line end
                chunk.append(words[i][:k] + '-')
                words[i] = words[i][k:]
            if chunk:
                lines.append(' '.join(chunk))
open(out, 'w').write('\n'.join(lines) + '\n')
print(len(lines), 'lines')
