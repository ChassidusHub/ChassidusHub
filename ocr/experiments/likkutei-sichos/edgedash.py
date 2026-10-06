"""A dash at either edge of a printed line, found in the ink alone (no model):
the outermost blob of the line, long, thin and at mid height, with white
between it and the next ink. inkfix.py finds the same marks but needs the
model's letter positions, hours of reading on a CPU; this needs none, so it
can check every training line. The readers drop a line-end dash now and then
(4 of the 27 wrong lines in Shmuly's 199-line Yiddish check, 2026-10-05), and
labels made from their readings (yidpairs.py) inherit the gap.

    edgedash.py <list.txt>           # how many labels lack an edge dash the ink has
    edgedash.py <list.txt> --write   # add them to the .gt.txt files"""
import sys, unicodedata
import numpy as np
from PIL import Image
from scipy import ndimage

nfd = lambda t: unicodedata.normalize('NFC', str(t)).strip()


def edge_dashes(a):
    """(start, end): whether the line opens (right edge) and ends (left edge) with a dash."""
    ink = a < 128
    lab, n = ndimage.label(ink)
    if n < 2:
        return False, False
    rows = np.nonzero(ink.any(1))[0]
    top, bot = rows.min(), rows.max()
    body = bot - top + 1  # the line's ink height, ascenders and descenders included
    objs = ndimage.find_objects(lab)
    boxes = [(sl[1].start, sl[1].stop, sl[0].start, sl[0].stop) for sl in objs]

    def dash(b, others):
        x0, x1, y0, y1 = b
        w, h = x1 - x0, y1 - y0
        mid = (y0 + y1) / 2
        # long and thin, in the middle band (a maqaf sits high, an underline low), and
        # no longer than a few letters (the rule over the notes runs across the column)
        if not (w >= 3 * h and h <= 0.22 * body and w >= 0.3 * body and w <= 2.5 * body and top + 0.3 * body <= mid <= top + 0.75 * body):
            return False
        return True

    by_x0 = sorted(boxes, key=lambda b: b[0])
    by_x1 = sorted(boxes, key=lambda b: -b[1])
    end_b, start_b = by_x0[0], by_x1[0]
    # white between the dash and the rest of the line: at least a quarter of the body height
    gap = 0.25 * body
    end = dash(end_b, boxes) and min(b[0] for b in boxes if b is not end_b) >= end_b[1] + gap
    start = dash(start_b, boxes) and max(b[1] for b in boxes if b is not start_b) <= start_b[0] - gap
    return start, end


def main():
    paths = [l.strip() for l in open(sys.argv[1]) if l.strip()]
    write = '--write' in sys.argv
    counts = {'start added': 0, 'end added': 0, 'start ok': 0, 'end ok': 0, 'label dash, no ink': 0}
    shown = 0
    for p in paths:
        a = np.array(Image.open(p).convert('L'))
        g = nfd(open(p[:-4] + '.gt.txt', encoding='utf-8').read())
        s, e = edge_dashes(a)
        new = g
        if s:
            if g.startswith('—'): counts['start ok'] += 1
            else: new = '— ' + new; counts['start added'] += 1
        if e:
            if g.endswith('—'): counts['end ok'] += 1
            else: new = new + ' —'; counts['end added'] += 1
        if (g.startswith('—') and not s) or (g.endswith('—') and not e):
            counts['label dash, no ink'] += 1
        if new != g:
            if shown < 12:
                print(p.split('/')[-1], '|', g, '->', new); shown += 1
            if write:
                open(p[:-4] + '.gt.txt', 'w', encoding='utf-8').write(new + '\n')
    print(len(paths), 'lines;', counts)


if __name__ == '__main__':
    main()
