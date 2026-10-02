"""The font stage on a read page: every letter of every word cut from the scan and
judged Frank or Miram by facenet, a run of two or more Miram letters marked on the
word as 'face_net': [[first, after last]] (letters in the word's own order), with
the net's P(Miram) per letter in 'face_p'. It stands beside recog.faces (the
thickness method) so the two can be compared on pages marked by eye.

The letters come from letters.cut_line, which aligns the line's ink pieces with
what the reader read, so words with quotes and brackets are judged too."""
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


PREFIX = set('והבלכמש')


def word_runs(ps, text, cut=0.5):
    """The Miram stretch of a word from its letters' P(Miram): Miram covers a whole
    word, or all of it but a leading prefix letter (ו, ה, ב, ל...), so the answer is
    one of: nothing, the whole word, the word after its first letter. The stretch
    with the better mean wins, and needs most of its letters over the cut."""
    n = len(text)
    known = [(i, p) for i, p in enumerate(ps) if p is not None]
    if len(known) < max(1, n // 2):
        return []
    best, score = [], 0.0
    for k in (0, 1) if n > 1 else (0,):
        if k == 1 and text[0] not in PREFIX:
            continue
        sel = [p for i, p in known if i >= k]
        if not sel or (k == 1 and n - k < 2 and n > 1):
            continue
        mean = sum(sel) / len(sel); over = sum(p > cut for p in sel) / len(sel)
        # a lone letter (ו, ע') is marked only when the net is very sure: one letter is easy to misjudge
        if mean > (0.9 if len(sel) == 1 else 0.5) and over >= 0.6 and mean > score:
            best, score = [[k, n]], mean
    if best and best[0][0] == 1 and ps[0] is not None and ps[0] > 0.8:
        best = [[0, n]]
    return best


def net_faces(a, lay, fnet, cut=0.5):
    import letters
    todo = []  # (word dict, letter index in word, canvas, letter id)
    for key in ('body', 'notes'):
        lines = [l for col in lay[key] for l in col if l.get('words')]
        hs = [l['y1'] - l['y0'] for l in lines]
        med = float(np.median(hs)) if hs else 0
        for l in lines:
            if l['y1'] - l['y0'] < 0.85 * med:
                continue  # a smaller face (a date or source line) prints thinner all over; not Miram
            try:
                c = letters.cut_line(a, l, key)
            except Exception:
                c = None
            if c is None:
                continue
            # the line's visual chars, token by token, matched to the reader's words
            text = re.sub('[\ue000\ue001]', '', l['text'])
            vis = _visual(text)
            pos = 0
            for word in l['words']:
                wv = _visual(word['text']); n = len(wv)
                k = vis.find(wv, pos)
                if k < 0:
                    continue
                pos = k + n
                boxes = c['chars'][k:k + n]
                # a letter's index in the word's own order: visual order is the word's
                # order for its letters (digits run the other way, but they are not judged)
                got = 0
                for i, (ch, box) in enumerate(zip(wv, boxes)):
                    if box is None or not ('א' <= ch <= 'ת'):
                        continue
                    g, top = letters.glyph(c, box)
                    if g is None:
                        continue
                    todo.append((word, i, canvas(g, top, c['xh']), LETTERS.index(ch))); got += 1
                if got:
                    word['face_cut'] = 'ink'
    if not todo:
        return
    X = np.stack([t[2] for t in todo]); L = np.array([t[3] for t in todo], np.int64)
    p = fnet.predict(X, L)
    for (word, i, _, _), pi in zip(todo, p):
        word.setdefault('face_p', [None] * len(_visual(word['text'])))[i] = round(float(pi), 3)
    for word, *_ in todo:
        if 'face_net' in word:
            continue
        wv = _visual(word['text'])
        # only the letters count; marks around them (quotes, a bracket) are not judged
        idx = [i for i, ch in enumerate(wv) if 'א' <= ch <= 'ת']
        runs = word_runs([word['face_p'][i] for i in idx], ''.join(wv[i] for i in idx), cut)
        word['face_net'] = [[idx[i], idx[j - 1] + 1] for i, j in runs]
