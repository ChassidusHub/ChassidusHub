"""Training words for the font stage, v2: every word of a line as its letters,
each letter cut from the ink (letters.cut_line), set on the canvas (facenet),
with its stroke width against the line's, and its face. The face comes from
the label when it carries one (a fake line made with gen.py --face, exact by
construction) or, on a real line, from the first net where it was sure (over
0.95 or under 0.05), unknown (-1) otherwise so the loss skips it.

    facedata.py <list of pngs> <out.npz> [--real] [--shard i/n]

Out: X (letters, H, W/8 packed bits), L letter index, F (stroke width / x-height,
line median / x-height), Y face (1 Miram, 0 Frank, -1 unknown), WORD word number,
POS place in word, from which words are rebuilt as sequences."""
import os, re, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import face, letters
from facenet import canvas, LETTERS, H, W
from harvest import visual
from skimage.morphology import skeletonize

SPACE = re.compile(r'\s+')


def stroke(g):
    b = g > 0.5
    return b.sum() / max(1, skeletonize(b).sum())


def line_samples(png, real, net=None):
    a = np.array(Image.open(png).convert('L'))
    lab = open(png[:-4] + '.gt.txt', encoding='utf-8').read().strip()
    plain, spans = face.from_face(lab)
    plain = re.sub('[]', '', plain)
    miram = np.zeros(len(plain), bool)
    for i, j in spans:
        miram[i:j] = True
    line = {'y0': 0, 'y1': a.shape[0], 'x0': 0, 'x1': a.shape[1], 'text': plain}
    cut = letters.cut_line(a, line)
    if cut is None:
        return []
    vis = visual(plain)
    xh = cut['xh']
    out = []  # per word: [(canvas, letter id, stroke, label)]
    widths = []
    pos = 0; word_no = 0
    for tok in plain.split(' '):
        n = len(tok); k = pos; pos += n + 1
        items = []
        for i in range(n):
            ch = vis[k + i]; box = cut['chars'][k + i]
            if box is None or not ('א' <= ch <= 'ת'):
                continue
            g, top = letters.glyph(cut, box)
            if g is None or g.shape[0] < 0.3 * xh:
                continue
            sw = stroke(g) / xh; widths.append(sw)
            y = int(miram[k + i]) if not real else -1
            items.append([canvas(g, top, xh), LETTERS.index(ch), sw, y, i])
        if items:
            out.append(items)
    if not out:
        return []
    med = float(np.median(widths))
    for items in out:
        for it in items:
            it[2] = (it[2], med)
    if real and net is not None:
        flat = [it for items in out for it in items]
        X = np.stack([it[0] for it in flat]); L = np.array([it[1] for it in flat], np.int64)
        p = net.predict(X, L)
        for it, pi in zip(flat, p):
            it[3] = 1 if pi > 0.95 else 0 if pi < 0.05 else -1
    return out


if __name__ == '__main__':
    real = '--real' in sys.argv
    args = [x for x in sys.argv[1:] if x != '--real']
    shard = (0, 1)
    if '--shard' in args:
        k = args.index('--shard'); shard = tuple(int(x) for x in args[k + 1].split('/')); del args[k:k + 2]
    paths = [l.strip() for l in open(args[0]) if l.strip()][shard[0]::shard[1]]
    net = None
    if real:
        from facenet import Net
        net = Net().load('/home/user/lsdata/models/facenet.pt')
    Xs, Ls, Fs, Ys, Ws, Ps = [], [], [], [], [], []
    wn = 0; lines = 0
    for n, p in enumerate(paths):
        try:
            words = line_samples(p, real, net)
        except Exception as e:
            words = []
        if words:
            lines += 1
        for items in words:
            for c, li, (sw, med), y, i in items:
                Xs.append(np.packbits(c > 0.5, axis=-1)); Ls.append(li); Fs.append((sw, med)); Ys.append(y); Ws.append(wn); Ps.append(i)
            wn += 1
        if n % 500 == 0:
            print(n, 'lines', lines, 'words', wn, 'letters', len(Xs), flush=True)
    np.savez_compressed(args[1], X=np.array(Xs, np.uint8), L=np.array(Ls, np.int16), F=np.array(Fs, np.float16), Y=np.array(Ys, np.int8), WORD=np.array(Ws, np.int32), POS=np.array(Ps, np.int8))
    Y = np.array(Ys)
    print('done', lines, 'lines', wn, 'words', len(Xs), 'letters; miram', int((Y == 1).sum()), 'frank', int((Y == 0).sum()), 'unknown', int((Y == -1).sum()))
