"""A test set for the old typeface (vols 1-14), which has no typed text
anywhere: lines picked at random from body pages of each volume, cropped the
same way as the training lines, for a person to check against the scan. The
draft text a model writes beside them is only a starting point; until a
person checks a line its .draft.txt is never used as a label.

    oldtest.py <out dir> [lines per volume]"""
import random, sys
import numpy as np
import pymupdf
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from layout import deskew, page_layout, scan

out = sys.argv[1]
per = int(sys.argv[2]) if len(sys.argv) > 2 else 22
rng = random.Random(14)
import os
os.makedirs(out, exist_ok=True)
names = []
for v in range(1, 15):
    doc = pymupdf.open(f'full/ls_{v:02d}.pdf')
    n = len(doc)
    # Body pages only: skip the front matter and the indexes at the back.
    pages = rng.sample(range(int(n * 0.12), int(n * 0.85)), 6)
    got = 0
    for p in pages:
        a = scan(doc, p)
        if a is None:
            continue
        a = deskew(a)
        h, w = a.shape
        lay = page_layout(a)
        body = [(i, l) for col in lay['body'] for i, l in enumerate(col)]
        notes = [(i, l) for col in lay['notes'] for i, l in enumerate(col)]
        pick = rng.sample(body, min(3, len(body))) + rng.sample(notes, min(1, len(notes)))
        for k, (i, l) in enumerate(pick):
            if l['x1'] - l['x0'] < 200 or l['y1'] - l['y0'] < 15:
                continue  # stubs and specks are not lines
            kind = 'n' if (i, l) in notes else 'b'
            crop = a[max(0, l['y0'] - 6):min(h, l['y1'] + 6), max(0, l['x0'] - 6):min(w, l['x1'] + 6)]
            name = f'{out}/{v:02d}_p{p:04d}_{kind}{k}.png'
            Image.fromarray(crop).save(name)
            names.append(name)
            got += 1
        if got >= per:
            break
    print(v, got, flush=True)
open(f'{out}/list.txt', 'w').write('\n'.join(names) + '\n')
print(len(names), 'lines')
