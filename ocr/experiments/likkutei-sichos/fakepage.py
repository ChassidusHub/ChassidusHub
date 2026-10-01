"""A whole fake Likkutei Sichos page: every line of a real page (running
head, both body columns, the footnotes) rebuilt as a fake line of the same
typed text, at the same place and width, on the same baseline; the short
rules over the footnotes are drawn where the print has them. For a person
to judge whole pages, and later for layout training.

    python3 fakepage.py <stem> <pdf page> <out.png> [seed]"""
import json, sys
import numpy as np
import pymupdf
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import gen
from harvest import groups
from layout import deskew, scan
from light import labels


def baseline(img):
    gs, marks, info = groups(img < 128)
    return info[1] if info else img.shape[0] - 6


def head_pieces(a, head):
    """The running head's pieces (title words, the page number), each read from
    the scan with its place: they are spread across the page, not one line."""
    from recog import load, CONFIG
    from kraken.containers import Segmentation, BBoxLine
    net = load('/mnt/project-files/maftechos/model/kraken-maftechos-r4.safetensors')
    h, w = a.shape
    ink = (a[head['y0']:head['y1']] < 128).any(0)
    xs = np.nonzero(ink)[0]
    pieces, start = [], xs[0]
    for x, nxt in zip(xs, list(xs[1:]) + [None]):
        if nxt is None or nxt - x > 40:
            pieces.append((int(start), int(x) + 1))
            start = nxt
    seg = Segmentation(type='bbox', imagename='p', text_direction='horizontal-rl', script_detection=False,
                       lines=[BBoxLine(id=str(i), bbox=(max(0, x0 - 6), max(0, head['y0'] - 6), min(w, x1 + 6), min(h, head['y1'] + 6)), text_direction='horizontal-rl') for i, (x0, x1) in enumerate(pieces)])
    return [(rec.prediction.strip(), x0, x1) for rec, (x0, x1) in zip(net.predict(Image.fromarray(a), seg, CONFIG), pieces)]


if __name__ == '__main__':
    stem, p, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    rng = np.random.default_rng(int(sys.argv[4]) if len(sys.argv) > 4 else 0)
    a = deskew(scan(pymupdf.open(f'pdf/{stem}.pdf'), p))
    lay = json.load(open(f'ocr/{stem}_{p:02d}.json'))
    typed = labels('pairs')
    cp = gen.Copies()
    page = np.full(a.shape, 255, np.uint8)
    h, w = a.shape

    def put(line, text, note):
        real = a[max(0, line['y0'] - 6):line['y1'] + 6, line['x0']:line['x1']]
        for _ in range(5):
            f = gen.make('realcopy', text, rng, cp, note, line['x1'] - line['x0'])
            if f is not None:
                break
        else:
            return
        f = gen.crop(f, 0)
        width = line['x1'] - line['x0']
        if f.shape[1] > width + 3:  # too long for its place: set tighter, as a compositor would
            f = np.array(Image.fromarray(f).resize((width, f.shape[0]), Image.LANCZOS))
            f = np.where(f < 128, 0, 255).astype(np.uint8)
        y = line['y0'] - 6 + baseline(real) - baseline(f)
        x = line['x1'] - f.shape[1]
        y0, x0 = max(0, y), max(0, x)
        region = page[y0:y0 + f.shape[0], x0:x0 + f.shape[1]]
        page[y0:y0 + f.shape[0], x0:x0 + f.shape[1]] = np.minimum(region, f[y0 - y:y0 - y + region.shape[0], x0 - x:x0 - x + region.shape[1]])

    for key, kind in (('body', 'b'), ('notes', 'n')):
        named = typed.get((stem, p, kind), [])
        k = 0
        for col in lay[key]:
            for line in col:
                text = line.get('text', '')
                if k < len(named) and named[k][0] == text:
                    text = named[k][1] or text
                    k += 1
                if len(text) > 1:
                    put(line, text, kind == 'n')
    # The running head, read from the scan (the typed text has none).
    head = lay['head']
    if head:
        for t, x0, x1 in head_pieces(a, head):
            if t:
                put({'y0': head['y0'], 'y1': head['y1'], 'x0': x0, 'x1': x1}, t, False)
    # The short rule over each column's footnotes: a plain stroke, copied as it is.
    for col in lay['notes']:
        if not col:
            continue
        top = col[0]['y0']
        x0, x1 = min(l['x0'] for l in col), max(l['x1'] for l in col)
        band = a[max(0, top - 40):top - 4, x0:x1] < 128
        rows = [r for r in range(band.shape[0]) if band[r].sum() > 0.1 * (x1 - x0)]
        for r in rows:
            page[top - 40 + r, x0:x1] = np.where(band[r], 0, page[top - 40 + r, x0:x1])
    Image.fromarray(page).save(out)
