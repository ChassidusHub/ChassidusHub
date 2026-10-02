"""The font stage on a read page: every letter of every word cut from the scan and
judged Frank or Miram by facenet, a run of two or more Miram letters marked on the
word as 'face_net': [[first, after last]] (letters in the word's own order), with
the net's P(Miram) per letter in 'face_p'. It stands beside recog.faces (the
thickness method) so the two can be compared on pages marked by eye.

The letters are cut from the line's ink alone (line_letters), never from the
reader's letter positions, which drift when a line's box is off."""
import os, re
import numpy as np
from facenet import Net, canvas, LETTERS, XH

HEB = re.compile(r'^[א-ת]+$')


def load(path=None):
    path = path or os.environ.get('FACENET', '/home/user/lsdata/models/facenet.pt')
    return Net().load(path)


def _visual(t):
    from harvest import visual
    return visual(t)


def line_letters(a, l, words):
    """Each word's letters cut from the line's ink, by the ink alone: the line's ink
    pieces (letters, right to left) are split into words at the widest gaps, then
    each word's pieces are brought to its letter count, joining the closest pair
    when the ink broke a letter in two, cutting the widest piece at its thinnest
    column when two letters touch. Returns per word a list of (glyph, top, xh) per
    letter or None when the ink did not come out as the words say, plus the pieces
    for the record."""
    from harvest import groups
    band = a[l['y0']:l['y1'], l['x0']:l['x1']] < 128
    gs, marks, info = groups(band)
    if not info or not words:
        return [None] * len(words)
    lab, base, xh = info
    hs = [g['y1'] - g['y0'] for g in gs]
    mh = float(np.median(hs))
    # specks and hairline bits are not letters (a raised note digit is about half a letter tall)
    gs = [g for g in gs if g['y1'] - g['y0'] >= 0.3 * mh]
    counts = [len(_visual(w['text'])) for w in words]
    if len(gs) < sum(counts) - len(gs) // 2 or len(words) > len(gs):
        return [None] * len(words)
    gaps = [gs[i]['x0'] - gs[i + 1]['x1'] for i in range(len(gs) - 1)]
    cut_at = sorted(sorted(range(len(gaps)), key=lambda i: -gaps[i])[:len(words) - 1])
    bounds = [0] + [i + 1 for i in cut_at] + [len(gs)]
    out = []
    for w, n, (b0, b1) in zip(words, counts, zip(bounds, bounds[1:])):
        pieces = [dict(g) for g in gs[b0:b1]]
        if not HEB.match(w['text']):
            out.append(None); continue
        tries = 0
        while len(pieces) != n and tries < 6:
            tries += 1
            if len(pieces) > n:
                # join the two closest pieces (a letter broken by light ink)
                g = [pieces[i]['x0'] - pieces[i + 1]['x1'] for i in range(len(pieces) - 1)]
                i = int(np.argmin(g)); p, q = pieces[i], pieces[i + 1]
                pieces[i:i + 2] = [dict(x0=q['x0'], x1=p['x1'], y0=min(p['y0'], q['y0']), y1=max(p['y1'], q['y1']), ids=p['ids'] + q['ids'])]
            else:
                # cut the widest piece at its thinnest column away from its edges
                i = int(np.argmax([p['x1'] - p['x0'] for p in pieces])); p = pieces[i]
                sub = np.isin(lab[p['y0']:p['y1'], p['x0']:p['x1']], p['ids'])
                col = sub.sum(0); m = max(2, (p['x1'] - p['x0']) // 4)
                if len(col) <= 2 * m:
                    break
                c = m + int(np.argmin(col[m:len(col) - m]))
                left = dict(p, x1=p['x0'] + c, split=True); right = dict(p, x0=p['x0'] + c, split=True)
                pieces[i:i + 1] = [right, left]
        if len(pieces) != n:
            out.append(None); continue
        letters = []
        for p in pieces:
            sub = np.isin(lab[p['y0']:p['y1'], p['x0']:p['x1']], p['ids']) if not p.get('split') else (band[p['y0']:p['y1'], p['x0']:p['x1']] & np.isin(lab[p['y0']:p['y1'], p['x0']:p['x1']], p['ids']))
            ys, xs = np.nonzero(sub)
            if not len(ys):
                letters = None; break
            letters.append((sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32), p['y0'] + ys.min() - base, max(1, base - xh)))
        out.append(letters)
    return out


def net_faces(a, lay, fnet, cut=0.5):
    todo = []  # (word dict, letter index in word, canvas, letter id)
    for key in ('body', 'notes'):
        for col in lay[key]:
            for l in col:
                words = l.get('words', [])
                if not any(HEB.match(w['text']) for w in words):
                    continue
                try:
                    cuts = line_letters(a, l, words)
                except Exception:
                    cuts = [None] * len(words)
                for word, letters in zip(words, cuts):
                    if not HEB.match(word['text']):
                        continue
                    n = len(word['text'])
                    if letters is not None:
                        for i, (glyph, top, xh) in enumerate(letters):
                            todo.append((word, i, canvas(glyph, top, xh), LETTERS.index(word['text'][i])))
                        word['face_cut'] = 'ink'
                    else:
                        word['face_cut'] = 'none'
    if not todo:
        return
    X = np.stack([t[2] for t in todo]); L = np.array([t[3] for t in todo], np.int64)
    p = fnet.predict(X, L)
    for (word, i, _, _), pi in zip(todo, p):
        word.setdefault('face_p', [None] * len(word['text']))[i] = round(float(pi), 3)
    for word, *_ in todo:
        if 'face_net' in word:
            continue
        ps = word['face_p']; runs = []; i = 0
        while i < len(ps):
            if ps[i] is not None and ps[i] > cut:
                j = i
                while j < len(ps) and ps[j] is not None and ps[j] > cut:
                    j += 1
                if j - i >= 2 or (j - i == 1 and len(ps) == 1 and ps[i] > 0.9):
                    runs.append([i, j])
                i = j
            else:
                i += 1
        word['face_net'] = runs
