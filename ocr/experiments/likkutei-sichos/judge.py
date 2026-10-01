"""The letter judge: a small network that looks at one letter cut from the
scan at full size and says which of the look-alikes it is. The line model
decides most letters well; the judge is asked only where it hesitates
between ב/כ, ת/ח, ז/ן/ו, or where the word check proposes a swap.

    judge.py train <crops dir> <out.pt> [--epochs 12 --holdout 0.1]
    judge.py test <crops dir> <model.pt>

The crops come from lettercrops.py (index_*.tsv: file, letter, line, x).
Lines, not crops, are held out, so a letter is never judged on the page it
was learned from."""
import argparse, csv, glob, os, random, sys, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image

LETTERS = 'בכתחזןו'


def load(crops):
    rows = []
    for fn in sorted(glob.glob(os.path.join(crops, 'index_*.tsv'))):
        rows += [r for r in csv.reader(open(fn, encoding='utf-8'), delimiter='\t') if len(r) == 4 and r[1] in LETTERS]
    return rows


def tensor(crops, rows):
    x = np.stack([np.asarray(Image.open(os.path.join(crops, r[0])).convert('L'), dtype=np.uint8) for r in rows])
    y = np.array([LETTERS.index(r[1]) for r in rows])
    return torch.from_numpy(x), torch.from_numpy(y)


class Judge(nn.Module):
    def __init__(self, n=len(LETTERS)):
        super().__init__()
        c = lambda i, o: nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.Conv2d(o, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.MaxPool2d(2))
        self.f = nn.Sequential(c(1, 32), c(32, 64), c(64, 128), c(128, 192))  # 64 -> 4
        self.h = nn.Sequential(nn.Flatten(), nn.Dropout(0.3), nn.Linear(192 * 16, 256), nn.ReLU(), nn.Dropout(0.3), nn.Linear(256, n))

    def forward(self, x):
        return self.h(self.f(x))


def prep(x, train):
    x = 1 - x.float().unsqueeze(1) / 255  # ink = 1
    if train:  # small shifts and scale, as the frame's x is only roughly the letter's centre
        n = x.shape[0]
        th = torch.zeros(n, 2, 3); s = 1 + (torch.rand(n) - 0.5) * 0.2
        th[:, 0, 0] = s; th[:, 1, 1] = s; th[:, :, 2] = (torch.rand(n, 2) - 0.5) * 0.25
        grid = F.affine_grid(th, x.shape, align_corners=False)
        x = F.grid_sample(x, grid, align_corners=False, padding_mode='zeros')
    return x


def split(rows, holdout):
    lines = sorted({r[2] for r in rows}); random.Random(0).shuffle(lines)
    held = set(lines[:int(len(lines) * holdout)])
    return [r for r in rows if r[2] not in held], [r for r in rows if r[2] in held]


def evaluate(net, x, y, bs=512):
    net.eval(); right = 0; conf = np.zeros((len(LETTERS), len(LETTERS)), int)
    with torch.no_grad():
        for i in range(0, len(x), bs):
            p = net(prep(x[i:i + bs], False)).argmax(1)
            right += (p == y[i:i + bs]).sum().item()
            for a, b in zip(y[i:i + bs].tolist(), p.tolist()):
                conf[a, b] += 1
    return right / len(x), conf


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['train', 'test']); ap.add_argument('crops'); ap.add_argument('model')
    ap.add_argument('--epochs', type=int, default=12); ap.add_argument('--holdout', type=float, default=0.1)
    ap.add_argument('--threads', type=int, default=4)
    a = ap.parse_args()
    torch.set_num_threads(a.threads); torch.manual_seed(0)
    rows = load(a.crops)
    tr, te = split(rows, a.holdout)
    print(f'{len(rows)} crops: {len(tr)} to learn from, {len(te)} held out ({len({r[2] for r in te})} lines)', flush=True)
    xte, yte = tensor(a.crops, te)
    if a.cmd == 'test':
        net = Judge(); net.load_state_dict(torch.load(a.model)); acc, conf = evaluate(net, xte, yte)
    else:
        xtr, ytr = tensor(a.crops, tr)
        net = Judge(); opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-4)
        steps = a.epochs * (len(xtr) // 128 + 1); sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=steps)
        # the rare letters (ז, ח) weigh more, so the judge is not just learning that ו is common
        w = torch.tensor([1 / max(1, (ytr == k).sum().item()) for k in range(len(LETTERS))]); w = w / w.sum() * len(LETTERS)
        t0 = time.time()
        for ep in range(a.epochs):
            net.train(); perm = torch.randperm(len(xtr)); loss_sum = 0
            for i in range(0, len(xtr), 128):
                idx = perm[i:i + 128]
                loss = F.cross_entropy(net(prep(xtr[idx], True)), ytr[idx], weight=w ** 0.5, label_smoothing=0.05)
                opt.zero_grad(); loss.backward(); opt.step(); sched.step(); loss_sum += loss.item() * len(idx)
            acc, conf = evaluate(net, xte, yte)
            print(f'epoch {ep + 1}: loss {loss_sum / len(xtr):.4f}, held-out {100 * acc:.3f}%  ({round(time.time() - t0)} s)', flush=True)
            torch.save(net.state_dict(), a.model)  # each epoch, so a cut-off run still leaves a judge
        torch.save(net.state_dict(), a.model)
    print(f'held-out accuracy {100 * acc:.3f}%'); print('   ' + '  '.join(LETTERS))
    for k, ch in enumerate(LETTERS):
        print(ch, ' '.join(f'{v:6d}' for v in conf[k]))
