"""The font stage: a small net that says, for one letter cut from a scan, whether
it is set in Frank (the body face) or Miram (the light face LS uses for stress,
written as bold). It is separate from the reader on purpose: the reader keeps
reading letters, this only answers Frank or Miram, so a mistake here never
touches the text and the two are improved apart.

Training letters are the real letter copies cut from the scans for the fonts
(frank2/letters.pkl: Frank body 'F:' and footnote-size 'nF:'; miram2/letters_ok.pkl:
Miram 'L:' and 'nL:'), each known by face. Every copy is set on a fixed canvas at
the page's x-height so stroke weight against letter size is kept, right-aligned on
its baseline as printed. The letter itself goes in too (the reader knows it), since
a thin letter is judged against what that letter looks like.

    facenet.py build      -> ev/face/{train,test}.npz (test = whole pages held out)
    facenet.py train      -> models/facenet.pt (and the test score)
    facenet.py test       -> the test score by letter
"""
import os, pickle, sys, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)) + '/..'
LETTERS = [chr(c) for c in range(0x5d0, 0x5eb)]
H, W, XH, BASE = 56, 40, 20, 38   # canvas; the x-height is scaled to 20 px, the baseline sits at row 38
HOLD = {'30_0001', '31_0020', '33_0040', '35_0100', '37_0150', '38_0040', '39_0060', '34_0041', '32_0088', '36_0012'}


def canvas(g, top, xh, rng=None):
    """A letter's binary crop set on the canvas: scaled so the page's x-height is XH,
    its top at BASE + top (top is against the baseline, negative above it), right-aligned.
    With rng, jittered a little (scale, shift, threshold) as a cut from a scan would be."""
    f = XH / max(1, xh)
    if rng is not None:
        f *= rng.uniform(0.93, 1.07)
    im = Image.fromarray((g * 255).astype(np.uint8))
    w, h = max(1, round(g.shape[1] * f)), max(1, round(g.shape[0] * f))
    a = np.asarray(im.resize((w, h), Image.BILINEAR), np.float32) / 255
    if rng is not None:
        a = (a > rng.uniform(0.35, 0.65)).astype(np.float32)
    c = np.zeros((H, W), np.float32)
    y = BASE + round(top * f)
    x = W - 4 - w
    if rng is not None:
        y += int(rng.integers(-2, 3)); x += int(rng.integers(-2, 3))
    y0, x0 = max(0, y), max(0, x)
    a = a[y0 - y:, x0 - x:]
    a = a[:H - y0, :W - x0]
    c[y0:y0 + a.shape[0], x0:x0 + a.shape[1]] = a
    return c


def load_copies():
    from buildfont import unpack
    out = []  # (letter index, face, src, g, top, xh)
    for f, face in ((f'{HERE}/frank2/letters.pkl', 0), (f'{HERE}/miram2/letters_ok.pkl', 1)):
        st = pickle.load(open(f, 'rb'))
        for k, v in st.items():
            if ':' not in k:
                continue
            ch = k.split(':', 1)[1]
            if len(ch) != 1 or ch not in LETTERS:
                continue   # pointed letters and marks are not judged
            li = LETTERS.index(ch)
            for r in v:
                out.append((li, face, r.get('src', ''), r))
    return out


def build(n_per=2500, seed=0):
    """Balanced: up to n_per copies of each letter and face from the training pages,
    every copy of the held-out pages for the test. Images are kept as uint8 bits."""
    from buildfont import unpack
    rng = np.random.default_rng(seed)
    cps = load_copies()
    by = {}
    for li, face, src, r in cps:
        by.setdefault((li, face, src in HOLD), []).append(r)
    sets = {'train': [], 'test': []}
    for (li, face, hold), rs in sorted(by.items()):
        name = 'test' if hold else 'train'
        if not hold and len(rs) > n_per:
            rs = [rs[i] for i in rng.choice(len(rs), n_per, replace=False)]
        for r in rs:
            sets[name].append((li, face, r))
    os.makedirs(f'{HERE}/ev/face', exist_ok=True)
    for name, rows in sets.items():
        X = np.zeros((len(rows), H, W), np.uint8); L = np.zeros(len(rows), np.int16); Y = np.zeros(len(rows), np.int8)
        for i, (li, face, r) in enumerate(rows):
            X[i] = canvas(unpack(r), r['top'], r['xh'], rng if name == 'train' else None) > 0.5
            L[i], Y[i] = li, face
        np.savez_compressed(f'{HERE}/ev/face/{name}.npz', X=np.packbits(X, axis=-1), L=L, Y=Y)
        print(name, len(rows), 'miram', int(Y.sum()), flush=True)


def unpackX(X):
    return np.unpackbits(X, axis=-1)[:, :, :W].astype(np.float32)


class Net:
    def __init__(self):
        import torch, torch.nn as nn
        self.torch = torch
        class M(nn.Module):
            def __init__(s):
                super().__init__()
                s.emb = nn.Embedding(len(LETTERS), 8)
                s.conv = nn.Sequential(
                    nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),     # 28x20
                    nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),    # 14x10
                    nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),    # 7x5
                    nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d((2, 2)))
                s.fc = nn.Sequential(nn.Linear(64 * 4 + 8, 64), nn.ReLU(), nn.Dropout(0.2), nn.Linear(64, 2))
            def forward(s, x, l):
                h = s.conv(x.unsqueeze(1)).flatten(1)
                return s.fc(torch.cat([h, s.emb(l)], 1))
        self.m = M()

    def predict(self, X, L, bs=2048):
        """P(Miram) for canvases X (n,H,W float) with letter indices L."""
        torch = self.torch
        self.m.eval(); out = []
        with torch.no_grad():
            for i in range(0, len(X), bs):
                p = torch.softmax(self.m(torch.from_numpy(X[i:i + bs]), torch.from_numpy(L[i:i + bs]).long()), 1)[:, 1]
                out.append(p.numpy())
        return np.concatenate(out) if out else np.zeros(0)

    def save(self, path):
        self.torch.save(self.m.state_dict(), path)

    def load(self, path):
        self.m.load_state_dict(self.torch.load(path, map_location='cpu')); self.m.eval()
        return self


def train(epochs=6, seed=0):
    import torch
    torch.manual_seed(seed); torch.set_num_threads(max(1, os.cpu_count() - 1))
    d = np.load(f'{HERE}/ev/face/train.npz'); X, L, Y = unpackX(d['X']), d['L'].astype(np.int64), d['Y'].astype(np.int64)
    t = np.load(f'{HERE}/ev/face/test.npz'); Xt, Lt, Yt = unpackX(t['X']), t['L'].astype(np.int64), t['Y'].astype(np.int64)
    net = Net(); m = net.m
    opt = torch.optim.AdamW(m.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=epochs * ((len(X) + 255) // 256))
    # Miram is rarer than Frank in the training pages: weight it so a miss costs as much as a false alarm.
    wt = torch.tensor([1.0, (Y == 0).sum() / max(1, (Y == 1).sum())], dtype=torch.float32)
    loss_fn = torch.nn.CrossEntropyLoss(weight=wt)
    rng = np.random.default_rng(seed)
    os.makedirs(f'{HERE}/models', exist_ok=True)
    for ep in range(epochs):
        m.train(); order = rng.permutation(len(X)); tot = 0; t0 = time.time()
        for i in range(0, len(X), 256):
            idx = order[i:i + 256]
            x = torch.from_numpy(X[idx]); l = torch.from_numpy(L[idx]); y = torch.from_numpy(Y[idx])
            # a sliver of a neighbour at the left or right edge, as a cut from a line can carry
            if rng.random() < 0.5:
                k = int(rng.integers(1, 4)); side = rng.random() < 0.5
                nb = torch.from_numpy(X[rng.permutation(len(idx))])
                if side: x[:, :, :k] = torch.maximum(x[:, :, :k], nb[:, :, W - k:])
                else: x[:, :, W - k:] = torch.maximum(x[:, :, W - k:], nb[:, :, :k])
            loss = loss_fn(m(x, l), y)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tot += loss.item() * len(idx)
        p = net.predict(Xt, Lt)
        acc = ((p > 0.5) == Yt).mean(); rec = ((p > 0.5) & (Yt == 1)).sum() / max(1, (Yt == 1).sum()); prec = ((p > 0.5) & (Yt == 1)).sum() / max(1, (p > 0.5).sum())
        print(f'epoch {ep + 1} loss {tot / len(X):.4f} test acc {acc:.4f} miram recall {rec:.4f} precision {prec:.4f} ({time.time() - t0:.0f}s)', flush=True)
        net.save(f'{HERE}/models/facenet.pt')
    test(net)


def test(net=None):
    t = np.load(f'{HERE}/ev/face/test.npz'); Xt, Lt, Yt = unpackX(t['X']), t['L'].astype(np.int64), t['Y'].astype(np.int64)
    net = net or Net().load(f'{HERE}/models/facenet.pt')
    p = net.predict(Xt, Lt) > 0.5
    print('letter  n_frank n_miram  wrong_frank wrong_miram')
    for li in range(len(LETTERS)):
        s = Lt == li
        if not s.any():
            continue
        f, mm = s & (Yt == 0), s & (Yt == 1)
        print(f'{LETTERS[li]}  {f.sum():7d} {mm.sum():7d}  {(p[f]).sum():10d} {(~p[mm]).sum():10d}')
    print('total acc', ((p == Yt).mean()))


if __name__ == '__main__':
    {'build': build, 'train': train, 'test': test}[sys.argv[1]]()
