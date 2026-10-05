"""Ink a line crop carries that is not the line's: the tails of the line above
and the tops of the line below reach into the PAD band around the line box
(recog.PAD), and the reader counts them now and then (a tail read as a geresh
or a comma, 2026-10-04). A blob whose every pixel lies in the band outside the
line box is not part of the line (a letter's own ascender or descender crosses
into the band but starts inside the box), so it is whitened before reading.

    from clean import clean_line; crop = clean_line(crop, pad)"""
import numpy as np
from scipy import ndimage


def clean_line(crop, pad, ink=128):
    """The crop with every blob that lies wholly in the top or bottom band whitened."""
    if pad <= 0:
        return crop
    labels, n = ndimage.label(crop < ink)
    if not n:
        return crop
    rows = ndimage.find_objects(labels)
    h = crop.shape[0]
    out = crop.copy()
    for i, sl in enumerate(rows, 1):
        ys = sl[0]
        if ys.stop <= pad or ys.start >= h - pad:
            out[sl][labels[sl] == i] = 255
    return out


def clean_page(a, lines, ink=128, keep=400):
    """The page with every blob whose centre lies outside all the line boxes
    whitened, for the reading only (stars and faces look at the page as scanned).
    A blob of `keep` pixels or more stays: a rule, a star or a word the layout
    missed is not dust, and a dropped line is a layout fault to fix there."""
    labels, n = ndimage.label(a < ink)
    if not n:
        return a
    boxes = ndimage.find_objects(labels)
    inside = np.zeros(a.shape, bool)
    for l in lines:
        inside[l['y0']:l['y1'], l['x0']:l['x1']] = True
    out = a.copy()
    for i, sl in enumerate(boxes, 1):
        cy, cx = (sl[0].start + sl[0].stop) // 2, (sl[1].start + sl[1].stop) // 2
        if inside[cy, cx]:
            continue
        blob = labels[sl] == i
        if blob.sum() < keep:
            out[sl][blob] = 255
    return out
