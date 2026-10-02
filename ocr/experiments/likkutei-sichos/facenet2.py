"""The font stage, v2: a word's letters judged together. Each letter's canvas
goes through a small CNN; with it go the letter itself and two measures a
person uses without thinking: the letter's stroke width and the line's usual
stroke width, both in x-heights, so a light scan or a heavy one is judged
against itself. A two-way GRU over the word's letters then lets neighbours
settle each other, since Miram runs over a word or all but its prefix letter.
Trained on facedata.py words: fakes with exact faces, real lines where v1 was sure.

    facenet2.py train <out.pt> <shard.npz>... [--epochs N] [--val shard.npz]
"""
import os, sys, time
import numpy as np

H, W = 56, 40
NLET = 27


def load_shards(paths):
    Xs, Ls, Fs, Ys, Ws = [], [], [], [], []
    base = 0
    for p in paths:
        d = np.load(p)
        Xs.append(d['X']); Ls.append(d['L'].astype(np.int64)); Fs.append(d['F'].astype(np.float32)); Ys.append(d['Y'].astype(np.int64))
        w = d['WORD'].astype(np.int64); Ws.append(w + base); base += int(w.max()) + 1 if len(w) else 0
    X, L, F, Y, Wd = (np.concatenate(v) for v in (Xs, Ls, Fs, Ys, Ws))
    # words as index ranges (letters of a word are stored together)
    starts = np.flatnonzero(np.r_[True, Wd[1:] != Wd[:-1]])
    ends = np.r_[starts[1:], len(Wd)]
    return X, L, F, Y, list(zip(starts, ends))


def feats(F):
    # stroke width, line median, and their ratio (the thickness method's own number)
    return np.stack([F[:, 0] * 5, F[:, 1] * 5, F[:, 0] / np.maximum(F[:, 1], 1e-3)], 1).astype(np.float32)


class Net:
    def __init__(self):
        import torch, torch.nn as nn
        self.torch = torch

        class M(nn.Module):
            def __init__(s):
                super().__init__()
                s.emb = nn.Embedding(NLET, 8)
                s.conv = nn.Sequential(
                    nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                    nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                    nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                    nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d((2, 2)))
                s.mix = nn.Sequential(nn.Linear(64 * 4 + 8 + 3, 128), nn.ReLU(), nn.Dropout(0.2))
                s.gru = nn.GRU(128, 64, batch_first=True, bidirectional=True)
                s.out = nn.Linear(128, 2)

            def forward(s, x, l, f, lengths):
                # x (B,T,H,W) l (B,T) f (B,T,3); lengths (B)
                B, T = l.shape
                h = s.conv(x.reshape(B * T, 1, H, W)).flatten(1)
                h = s.mix(torch.cat([h, s.emb(l.reshape(-1)), f.reshape(B * T, 3)], 1)).reshape(B, T, -1)
                packed = nn.utils.rnn.pack_padded_sequence(h, lengths.cpu(), batch_first=True, enforce_sorted=False)
                o, _ = s.gru(packed)
                o, _ = nn.utils.rnn.pad_packed_sequence(o, batch_first=True, total_length=T)
                return s.out(o)
        self.m = M()

    def batch(self, X, L, F, words, device='cpu'):
        torch = self.torch
        T = max(e - s for s, e in words); B = len(words)
        x = np.zeros((B, T, H, W), np.float32); l = np.zeros((B, T), np.int64); f = np.zeros((B, T, 3), np.float32); n = np.zeros(B, np.int64)
        for b, (s, e) in enumerate(words):
            k = e - s; n[b] = k
            x[b, :k] = np.unpackbits(X[s:e], axis=-1)[:, :, :W]; l[b, :k] = L[s:e]; f[b, :k] = feats(F[s:e])
        return (torch.from_numpy(x).to(device), torch.from_numpy(l).to(device), torch.from_numpy(f).to(device), torch.from_numpy(n))

    def predict_words(self, X, L, F, words, device='cpu', bs=256):
        """P(Miram) per letter, in the letters' stored order."""
        torch = self.torch
        self.m.eval(); out = np.zeros(len(X), np.float32)
        with torch.no_grad():
            for i in range(0, len(words), bs):
                ws = words[i:i + bs]
                x, l, f, n = self.batch(X, L, F, ws, device)
                p = torch.softmax(self.m(x, l, f, n), 2)[:, :, 1].cpu().numpy()
                for b, (s, e) in enumerate(ws):
                    out[s:e] = p[b, :e - s]
        return out

    def save(self, path):
        self.torch.save(self.m.state_dict(), path)

    def load(self, path, device='cpu'):
        self.m.load_state_dict(self.torch.load(path, map_location='cpu')); self.m.to(device).eval()
        return self


def score(p, Y, words, cut=0.5):
    # only the letters of these words count (p is set for them alone)
    idx = np.concatenate([np.arange(s, e) for s, e in words])
    p, Y = p[idx], Y[idx]
    k = Y >= 0
    acc = ((p[k] > cut) == (Y[k] == 1)).mean()
    rec = ((p[k] > cut) & (Y[k] == 1)).sum() / max(1, (Y[k] == 1).sum())
    prec = ((p[k] > cut) & (Y[k] == 1)).sum() / max(1, (p[k] > cut).sum())
    # words right: every known letter of the word on the right side
    wr, at = [], 0
    for s, e in words:
        n = e - s; q, y = p[at:at + n], Y[at:at + n]; at += n
        wr.append(bool(np.all((q[y >= 0] > cut) == (y[y >= 0] == 1))))
    return acc, rec, prec, float(np.mean(wr))


def train(out, shards, epochs=4, val=None, device=None, bs=128, seed=0):
    import torch
    device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
    torch.manual_seed(seed); torch.set_num_threads(max(1, os.cpu_count() - 1))
    X, L, F, Y, words = load_shards(shards)
    rng = np.random.default_rng(seed)
    if val:
        Xv, Lv, Fv, Yv, wv = load_shards([val])
    else:
        rng.shuffle(words); k = max(1, len(words) // 20)
        wv, words = words[:k], words[k:]; Xv, Lv, Fv, Yv = X, L, F, Y
    print(f'{len(words)} words to train, {len(wv)} to check; letters miram {(Y == 1).sum()} frank {(Y == 0).sum()} unknown {(Y == -1).sum()}', flush=True)
    net = Net(); m = net.m.to(device)
    opt = torch.optim.AdamW(m.parameters(), 2e-3, weight_decay=1e-4)
    steps = epochs * ((len(words) + bs - 1) // bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps)
    wt = torch.tensor([1.0, min(8.0, (Y == 0).sum() / max(1, (Y == 1).sum()))], dtype=torch.float32, device=device)
    loss_fn = torch.nn.CrossEntropyLoss(weight=wt, ignore_index=-1)
    for ep in range(epochs):
        m.train(); order = rng.permutation(len(words)); tot = 0; cnt = 0; t0 = time.time()
        for i in range(0, len(words), bs):
            ws = [words[j] for j in order[i:i + bs]]
            x, l, f, n = net.batch(X, L, F, ws, device)
            y = torch.full(l.shape, -1, dtype=torch.long)
            for b, (s, e) in enumerate(ws):
                y[b, :e - s] = torch.from_numpy(Y[s:e])
            y = y.to(device)
            if rng.random() < 0.5:  # a neighbour's sliver at an edge, as a cut from a line carries
                k = int(rng.integers(1, 4)); nb = x[torch.randperm(x.shape[0])]
                if rng.random() < 0.5: x[:, :, :, :k] = torch.maximum(x[:, :, :, :k], nb[:, :, :, W - k:])
                else: x[:, :, :, W - k:] = torch.maximum(x[:, :, :, W - k:], nb[:, :, :, :k])
            logits = m(x, l, f, n)
            loss = loss_fn(logits.reshape(-1, 2), y.reshape(-1))
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tot += loss.item(); cnt += 1
            if cnt % 200 == 0:
                print(f'  ep {ep + 1} step {cnt} loss {tot / cnt:.4f} ({time.time() - t0:.0f}s)', flush=True)
        p = net.predict_words(Xv, Lv, Fv, wv, device)
        acc, rec, prec, wr = score(p, Yv, wv)
        print(f'epoch {ep + 1} loss {tot / max(1, cnt):.4f} check: letters {acc:.4f} miram recall {rec:.4f} precision {prec:.4f} words right {wr:.4f} ({time.time() - t0:.0f}s)', flush=True)
        net.save(out)
    return net


if __name__ == '__main__':
    args = sys.argv[1:]
    epochs = 4; val = None
    if '--epochs' in args:
        k = args.index('--epochs'); epochs = int(args[k + 1]); del args[k:k + 2]
    if '--val' in args:
        k = args.index('--val'); val = args[k + 1]; del args[k:k + 2]
    if args[0] == 'train':
        train(args[1], args[2:], epochs, val)
