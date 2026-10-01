"""A numbered strip of real and fake lines mixed, for a person to judge
whether the fakes can be told apart; the key is saved beside it.

    python3 strip.py <out.png> <seed>"""
import glob, json, random, re, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import gen

if __name__ == '__main__':
    out, seed = sys.argv[1], int(sys.argv[2])
    rng = np.random.default_rng(seed); random.seed(seed)
    lines = [l.rstrip('\n').split('\t', 2) for l in open('lines_30_38.txt')]
    lines = [(t, k == 'n', int(w)) for k, w, t in lines if len(t) > 25 and not re.search('[A-Za-z_]', t)]
    pointed = [x for x in lines if re.search('[ְ-ׇ]', x[0])]
    cp = gen.Copies()
    items = []
    reals = glob.glob('pairs/3[0-8]/*_b*.png')
    real_pointed = [f for f in reals if re.search('[ְ-ׇ]', open(f[:-4] + '.gt.txt').read())]
    for f in random.sample(reals, 6) + random.sample(real_pointed, 2):
        items.append(('real', np.array(Image.open(f).convert('L'))))
    for kind, n in (('realcopy', 5), ('varied', 3)):
        k = 0
        while k < n:
            t, note, wd = (pointed if k < 1 else lines)[rng.integers(len(pointed if k < 1 else lines))]
            if note:
                continue
            a = gen.make(kind, t, rng, cp, note, wd)
            if a is None:
                continue
            items.append((kind, np.pad(a, 6, constant_values=255))); k += 1
    random.shuffle(items)
    w = max(a.shape[1] for _, a in items) + 60
    im = Image.new('L', (w, sum(a.shape[0] + 10 for _, a in items)), 255)
    d = ImageDraw.Draw(im); y = 0
    f = ImageFont.truetype('fonts/FrankLubavitch.ttf', 22)
    for i, (k, a) in enumerate(items, 1):
        im.paste(Image.fromarray(a), (w - a.shape[1], y)); d.text((4, y + a.shape[0] // 2 - 10), str(i), font=f, fill=0); y += a.shape[0] + 10
    im.save(out)
    json.dump({i: k for i, (k, _) in enumerate(items, 1)}, open(out[:-4] + '.key.json', 'w'))
