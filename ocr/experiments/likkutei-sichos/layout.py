"""Lines of a Likkutei Sichos body page, found by ink profiles: the running
head, two columns of body text, then (under a short rule) the footnotes,
also in two columns. Clean typeset scans need no learned segmenter."""
import io
import numpy as np
from PIL import Image


def deskew(a):
    small = Image.fromarray(a).resize((a.shape[1] // 4, a.shape[0] // 4))
    best = (0, 0.0)
    for tenth in range(-20, 21, 2):
        r = np.array(small.rotate(tenth / 10, fillcolor=255)) < 128
        score = np.var(r.sum(1))
        if score > best[0]:
            best = (score, tenth / 10)
    return a if best[1] == 0 else np.array(Image.fromarray(a).rotate(best[1], fillcolor=255, resample=Image.BICUBIC))


def runs(mask, min_len=1):
    out, start = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and start is None:
            start = i
        elif not m and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def gutter(a, top, bottom):
    # A sicha's heading sits centred across the gutter at the top (page 37's תבא
    # filled it), so the gutter is looked for below the top fifth of the text.
    top = top + (bottom - top) // 5
    ink = (a[top:bottom] < 128).sum(0).astype(float)
    ink = np.convolve(ink, np.ones(9) / 9, mode='same')
    w = a.shape[1]
    lo, hi = int(w * 0.38), int(w * 0.62)
    empty = ink[lo:hi] <= 0.004 * (bottom - top)
    r = runs(empty, 5)
    if not r:
        return None
    s, e = max(r, key=lambda x: x[1] - x[0])
    return lo + (s + e) // 2


def text_lines(col, y0, x0):
    """Line bands in a column crop, by the rows that hold ink."""
    ink = (col < 128).sum(1)
    thr = max(2, col.shape[1] * 0.01)
    bands = runs(ink > thr, 6)
    # Join a band too thin to be a line (points, a dot above) to its neighbour.
    merged = []
    for b in bands:
        if merged and (b[1] - b[0] < 12 or merged[-1][1] - merged[-1][0] < 12) and b[0] - merged[-1][1] < 8:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    out = []
    for s, e in merged:
        # The line's words: ink joined across word gaps; a speck far off to one side is left out.
        groups = []
        for a, b in runs((col[s:e] < 128).any(0), 1):
            if groups and a - groups[-1][1] < 60:
                groups[-1][1] = b
            else:
                groups.append([a, b])
        if not groups:
            continue
        a, b = max(groups, key=lambda g: g[1] - g[0])
        out.append({'y0': y0 + s, 'y1': y0 + e, 'x0': x0 + a, 'x1': x0 + b})
    return out


def column_rule(a, x0, x1, top):
    """Where a column's footnotes start: under a short rule, one stroke tall,
    across part of the column. Each column has its own, at its own height."""
    col = a[:, x0:x1] < 128
    rows = col.sum(1)
    w = x1 - x0
    for s, e in runs(rows > 3, 1):
        if s < top + 40 or e - s > 10:
            continue
        # Clear space above and below, so a letter stroke is not taken for it.
        if rows[max(0, s - 6):s].sum() > 20 or rows[e:e + 6].sum() > 20:
            continue
        # The longest unbroken stroke in the band, so a speck beside it doesn't count.
        strokes = runs(col[s:e].any(0), 1)
        span = max(b - a for a, b in strokes)
        if 0.12 * w < span < 0.8 * w:
            return s, e
    return None


def page_layout(a):
    """{'head': line, 'body': [[right col lines], [left]], 'notes': [[right], [left]]} in reading order."""
    h, w = a.shape
    rows = (a < 128).sum(1)
    # The running head is the first band of ink; a rule may sit under it.
    # (A band under 20 rows, like dirt at the scan's edge, is not a line.)
    bands = runs(rows > 3, 20)
    head = bands[0] if bands else (0, 0)
    top = head[1] + 5
    g = gutter(a, top, h)
    halves = [(g, w), (0, g)] if g else [(0, w)]
    out = {'head': {'y0': head[0], 'y1': head[1], 'x0': 0, 'x1': w}, 'headings': [], 'body': [], 'notes': []}
    # A sicha's heading is set across the page, centred over the gutter (תצא, with
    # the year under it): the lines at the top that cross the gutter, or sit short and
    # centred, are headings; the columns start under them.
    if g:
        for line in text_lines(a[top:, :], top, 0):
            # ink all the way across the gutter window (no white gap of 8 px), where
            # two column lines leave the gutter itself white
            prof = (a[line['y0']:line['y1'], g - 40:g + 40] < 128).sum(0)
            crosses = not runs(prof == 0, 8)
            centred = line['x1'] - line['x0'] < 0.5 * w and abs((line['x0'] + line['x1']) / 2 - w / 2) < 0.1 * w
            if not (crosses or centred) or line['y0'] > top + 0.25 * h:
                break
            out['headings'].append(line)
            top = line['y1'] + 3
    for x0, x1 in halves:
        rule = column_rule(a, x0, x1, top)
        bottom = rule[0] - 3 if rule else h
        out['body'].append(text_lines(a[top:bottom, x0:x1], top, x0))
        out['notes'].append(text_lines(a[rule[1] + 3:h, x0:x1], rule[1] + 3, x0) if rule else [])
    return out


def scan(doc, p):
    """Page p's scan as a grey array, or None. Most volumes embed the page
    itself; vol 39 embeds a 2560x2560 square of the scanner bed at the same
    resolution, which the pdf crops to the page, so a scan wider than any
    page is cut to what the pdf shows. (Narrower scans are left whole, as the
    first-pass OCR of vols 30-38 was read that way.)"""
    imgs = doc[p].get_images(full=True)
    if not imgs:
        return None
    a = np.array(Image.open(io.BytesIO(doc.extract_image(imgs[0][0])['image'])).convert('L'))
    if a.shape[1] > 2200:
        box, page = doc[p].get_image_bbox(imgs[0]), doc[p].rect
        sx, sy = a.shape[1] / box.width, a.shape[0] / box.height
        x0, y0 = int((page.x0 - box.x0) * sx), int((page.y0 - box.y0) * sy)
        a = a[max(0, y0):int(y0 + page.height * sy), max(0, x0):int(x0 + page.width * sx)]
    return a
