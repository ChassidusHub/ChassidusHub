"""Each printed character of a read line found in the line's ink, for anything
that works letter by letter (the font stage, a letter's confidence, a word's
exact place). The reader says what the line reads; the ink says where the
pieces are; the two are aligned by a best-cost match that allows for a letter
printed in two pieces, two letters that touch, a speck, and a mark the ink
does not show, each at a price, with a letter's expected width (widths.json,
measured on the scans per x-height) saying how well a piece fits it.

    cut_line(a, line) -> {'base', 'xh', 'chars': [per visual char: box or None]}

A box is {'x0','x1','y0','y1','ids'} in the line band's own coordinates, with
'split' when it is a share of a piece two letters touch in."""
import json, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WIDTHS = json.load(open(f'{HERE}/widths.json', encoding='utf-8'))
HIGH = set('"\'״׳')          # marks that sit in the top half of the line
LOW = set(',.')              # marks on the baseline
LETTER = re.compile(r'[א-ת]')


def expected(ch, xh, kind):
    """A character's usual width in px at this x-height, and its class."""
    tab = WIDTHS['nF' if kind == 'notes' else 'F']
    if LETTER.match(ch):
        return tab.get(ch, {'w': 0.6})['w'] * xh, 'letter'
    if ch.isdigit():
        return 0.45 * xh, 'digit'
    if ch in HIGH:
        return (0.45 if ch in '"״' else 0.2) * xh, 'high'
    if ch in LOW:
        return 0.2 * xh, 'low'
    if ch in '()[]':
        return 0.3 * xh, 'other'
    if ch in '—–-־':
        return 0.6 * xh, 'other'
    return 0.4 * xh, 'other'


def pieces_of(band):
    """The line's ink pieces right to left (letters, with their broken-off parts
    joined when they overlap), the baseline row and the x-height row."""
    from harvest import groups
    gs, marks, info = groups(band)
    if not info:
        return [], None, None
    lab, base, xh_row = info
    ps = sorted(gs + marks, key=lambda c: -c['x1'])
    return [(dict(p), lab) for p in ps], base, xh_row


def cut_line(a, line, kind='body'):
    text = re.sub('[\ue000\ue001]', '', line.get('text', ''))  # face marks are not ink
    from harvest import visual
    chars = list(visual(text))
    band = a[line['y0']:line['y1'], line['x0']:line['x1']] < 128
    ps, base, xh_row = pieces_of(band)
    if not ps or not chars:
        return None
    lab = ps[0][1]; ps = [p for p, _ in ps]
    xh = max(4, base - xh_row)
    n, m = len(ps), len(chars)
    E = [expected(c, xh, kind) for c in chars]
    W = [p['x1'] - p['x0'] for p in ps]

    def klass(p):
        if p['y1'] <= base - 0.5 * xh: return 'high'
        if p['y0'] >= base - 0.35 * xh: return 'low'
        return 'letter'

    K = [klass(p) for p in ps]
    tiny = [(p['y1'] - p['y0'] < 0.3 * xh and W[i] < 0.3 * xh) for i, p in enumerate(ps)]

    def fit(w, e):
        return abs(w - e) / max(1.0, e)

    def mis(pk, ck):
        # a high mark can only be a quote, a low one a comma or point; a letter or digit
        # needs a piece standing on the line
        if ck in ('letter', 'digit', 'other'): return 0.0 if pk == 'letter' else 2.0
        if ck == 'high': return 0.0 if pk == 'high' else 2.0
        if ck == 'low': return 0.0 if pk == 'low' else 2.0
        return 0.0

    def gapcost(i, j):
        # the gap before piece i, against whether the text has a space before char j
        if i == 0: return 0.0
        g = (ps[i - 1]['x0'] - ps[i]['x1']) / xh
        space = j > 0 and chars[j - 1] == ' '
        if space: return 0.0 if g >= 0.2 else 1.0
        return 1.0 if g >= 0.55 else 0.0

    INF = 1e9
    cost = np.full((n + 1, m + 1), INF); back = {}
    cost[0, 0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            c = cost[i, j]
            if c >= INF: continue
            # skip a char
            if j < m:
                sc = 0.0 if chars[j] == ' ' else 1.5
                if c + sc < cost[i, j + 1]: cost[i, j + 1] = c + sc; back[i, j + 1] = (i, j, 'nochar')
            # skip a piece
            if i < n:
                sp = 0.3 if tiny[i] else 1.5
                if c + sp < cost[i + 1, j]: cost[i + 1, j] = c + sp; back[i + 1, j] = (i, j, 'nopiece')
            if i < n and j < m and chars[j] != ' ':
                e, ck = E[j]
                # one piece, one char
                t = c + fit(W[i], e) + mis(K[i], ck) + gapcost(i, j)
                if t < cost[i + 1, j + 1]: cost[i + 1, j + 1] = t; back[i + 1, j + 1] = (i, j, 'one')
                # two pieces, one letter broken in two (a small gap between them)
                if i + 1 < n and ck == 'letter' and (ps[i]['x0'] - ps[i + 1]['x1']) < 0.2 * xh:
                    w = ps[i]['x1'] - ps[i + 1]['x0']
                    t = c + fit(w, e) + 0.6 + gapcost(i, j)
                    if t < cost[i + 2, j + 1]: cost[i + 2, j + 1] = t; back[i + 2, j + 1] = (i, j, 'broken')
                # one piece, two or three letters touching
                for k in (2, 3):
                    if j + k <= m and all(chars[j + q] != ' ' and E[j + q][1] in ('letter', 'digit') for q in range(k)) and K[i] == 'letter':
                        es = sum(E[j + q][0] for q in range(k))
                        t = c + fit(W[i], es) + 0.6 * (k - 1) + gapcost(i, j)
                        if t < cost[i + 1, j + k]: cost[i + 1, j + k] = t; back[i + 1, j + k] = (i, j, f'touch{k}')
    if cost[n, m] >= INF:
        return None
    # walk back
    out = [None] * m
    i, j = n, m
    while (i, j) != (0, 0):
        pi, pj, how = back[i, j]
        if how == 'one':
            out[pj] = dict(ps[pi], ids=list(ps[pi]['ids']))
        elif how == 'broken':
            p, q = ps[pi], ps[pi + 1]
            out[pj] = dict(x0=q['x0'], x1=p['x1'], y0=min(p['y0'], q['y0']), y1=max(p['y1'], q['y1']), ids=p['ids'] + q['ids'])
        elif how.startswith('touch'):
            k = int(how[5:]); p = ps[pi]
            sub = np.isin(lab[p['y0']:p['y1'], p['x0']:p['x1']], p['ids'])
            col = sub.sum(0)
            # cut points from the right, each at the thinnest column near the expected place
            es = [E[pj + q][0] for q in range(k)]; tot = sum(es)
            cuts = [p['x1']]
            for q in range(k - 1):
                want = p['x1'] - (sum(es[:q + 1]) / tot) * (p['x1'] - p['x0'])
                r = max(2, int(0.2 * xh)); lo = max(p['x0'] + 2, int(want - r)); hi = min(cuts[-1] - 2, int(want + r) + 1)
                c_ = lo + int(np.argmin(col[lo - p['x0']:hi - p['x0']])) if hi > lo else int(want)
                cuts.append(c_)
            cuts.append(p['x0'])
            for q in range(k):
                out[pj + q] = dict(x0=cuts[q + 1], x1=cuts[q], y0=p['y0'], y1=p['y1'], ids=list(p['ids']), split=True)
        i, j = pi, pj
    return {'base': int(base), 'xh': int(xh), 'chars': out, 'lab': lab, 'band': band, 'cost': float(cost[n, m])}


def glyph(cut, box):
    """The binary image of one character's box, and its top against the baseline."""
    lab = cut['lab']
    sub = np.isin(lab[box['y0']:box['y1'], box['x0']:box['x1']], box['ids'])
    ys, xs = np.nonzero(sub)
    if not len(ys):
        return None, 0
    return sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32), int(box['y0'] + ys.min() - cut['base'])
