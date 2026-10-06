"""How many dots the print has in each run of dots, from the ink alone. The
Chabad Library text writes ". ." where the print has ". . ." now and then (76
of 2,340 runs in the vol 30-39 labels, 2026-10-05), so the reader learned to
read three dots as two. A run is two or more small round blobs in the lower
half of the line, side by side, not under a letter (a point). The label's
runs are corrected only when the line has as many runs in the ink as in the
label, so each run can be paired with its own.

    from inkdots import fix_dots; fix_dots(label, gray_array) -> label"""
import re
import numpy as np
from scipy import ndimage

RUN = re.compile(r'\.(?: ?\.)+')


def dot_runs(a):
    """Lengths of the runs of two or more dots, right to left."""
    ink = a < 128
    lab, _ = ndimage.label(ink)
    rows = np.nonzero(ink.any(1))[0]
    if not len(rows):
        return []
    top, bot = rows.min(), rows.max()
    body = bot - top + 1
    boxes = sorted(((s[1].start, s[1].stop, s[0].start, s[0].stop) for s in ndimage.find_objects(lab)), key=lambda b: -b[1])

    def dot(b):
        w, h = b[1] - b[0], b[3] - b[2]
        return 2 <= w <= 0.3 * body and 2 <= h <= 0.3 * body and 0.5 <= w / h <= 2 and (b[2] + b[3]) / 2 > top + 0.45 * body
    big = [b for b in boxes if not dot(b)]
    runs, cur = [], 0
    for b in boxes:
        if dot(b):
            if not any(o[0] <= b[0] and b[1] <= o[1] for o in big):
                cur += 1
        elif cur:
            runs.append(cur)
            cur = 0
    if cur:
        runs.append(cur)
    return [r for r in runs if r >= 2]


def fix_dots(label, a):
    want = [m for m in RUN.finditer(label)]
    if not want:
        return label
    ink = dot_runs(a)
    if len(ink) != len(want):
        return label
    out, last = [], 0
    for m, n in zip(want, ink):
        have = m.group(0).count('.')
        out.append(label[last:m.start()])
        out.append(' '.join('.' * n) if {have, n} == {2, 3} else m.group(0))
        last = m.end()
    return ''.join(out) + label[last:]
