"""Real letter crops for the letter judge. The line model shrinks a line to
96 px high and then tells ב from כ by one corner; the judge sees the one
letter at the scan's full size instead. This reads lines with the line
model, and on lines it reads exactly as labelled (so the letters are known
and in order) cuts out every letter of the watched set at the frame where
the model emitted it, full resolution, and saves it with its letter.

    lettercrops.py <model> <list.txt> <out dir> [--letters בכתחזןו --threads 4 --shard i/n]

out dir gets <n>.png crops and index.tsv: file, letter, line, x."""
import argparse, os, sys, time, unicodedata
import numpy as np
import torch
from PIL import Image
from kraken.configs import RecognitionInferenceConfig
from kraken.containers import Segmentation, BBoxLine
from kraken.lib.ctc_decoder import greedy_decoder
from kraken.tasks import RecognitionTaskModel
from kraken.lib.bidi import get_display_map

ap = argparse.ArgumentParser()
ap.add_argument('model'); ap.add_argument('list'); ap.add_argument('out')
ap.add_argument('--letters', default='בכתחזןו')
ap.add_argument('--threads', type=int, default=4)
ap.add_argument('--shard', default='0/1')
ap.add_argument('--size', type=int, default=64)
a = ap.parse_args()
torch.set_num_threads(a.threads)
os.makedirs(a.out, exist_ok=True)
nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()
kept = {}


def capture(outputs, olens):
    o = outputs.float().cpu().numpy()
    kept['p'] = o[0, :, :int(olens[0])].T if olens is not None else o[0].T
    return greedy_decoder(outputs, olens)


net = RecognitionTaskModel.load_model(a.model)
cfg = RecognitionInferenceConfig(text_direction='horizontal-rl', num_line_workers=0, decoder=capture, accelerator='cpu')
codec = net.net.codec
labels = [''] * (max(l for ls in codec.c2l.values() for l in ls) + 1)
for ch, ls in codec.c2l.items():
    if len(ls) == 1:
        labels[ls[0]] = ch
i, n = map(int, a.shard.split('/'))
paths = [l.strip() for l in open(a.list) if l.strip()][i::n]


def crop(im, x, h, size):
    """A square window of 1.3 line heights around x, the letter kept at the
    scan's own size relative to the line (scaled with the line height)."""
    w = int(1.3 * h); x0 = int(x - w / 2)
    box = Image.new('L', (w, h), 255)
    box.paste(im.crop((max(0, x0), 0, min(im.width, x0 + w), h)), (max(0, -x0), 0))
    return box.resize((size, int(size * h / w)), Image.LANCZOS) if h < w else box.resize((int(size * w / h), size), Image.LANCZOS)


t0 = time.time(); k = 0
with open(os.path.join(a.out, f'index_{i}.tsv'), 'w', encoding='utf-8') as idx:
    for li, p in enumerate(paths):
        try:
            g = p.rsplit('.', 1)[0] + '.gt.txt'
            gt = nfd(open(g, encoding='utf-8').read())
            im = Image.open(p).convert('L'); W, H = im.size
            seg = Segmentation(type='bbox', imagename=p, text_direction='horizontal-rl', script_detection=False,
                               lines=[BBoxLine(id='0', bbox=(0, 0, W, H), text_direction='horizontal-rl')])
            next(iter(net.predict(im, seg, cfg)))
            pr = kept['p']; best = pr.argmax(1); T = len(best)
            fr, prev = [], 0
            for t, b in enumerate(best):
                if b != 0 and b != prev:
                    fr.append((labels[b], t))
                prev = b
            vis = ''.join(c for c, _ in fr)
            log, order = get_display_map(vis, 'R')
            if nfd(log) != gt:
                continue  # only lines read exactly: then every letter is known
            for j, ch in enumerate(log):
                if ch in a.letters:
                    t = fr[order[j]][1]; x = (t + 0.5) * W / T
                    c = crop(im, x, H, a.size)
                    sq = Image.new('L', (a.size, a.size), 255); sq.paste(c, ((a.size - c.width) // 2, (a.size - c.height) // 2))
                    fn = f'{i}_{k:07d}.png'; sq.save(os.path.join(a.out, fn)); k += 1
                    idx.write(f'{fn}\t{ch}\t{p}\t{int(x)}\n')
        except Exception as e:
            print('skip', p, repr(e)[:150], flush=True)
        if li % 500 == 0:
            print(f'shard {i}: {li}/{len(paths)} lines, {k} crops, {round(time.time() - t0)} s', flush=True)
print(f'shard {i}: done {len(paths)} lines, {k} crops, {round(time.time() - t0)} s', flush=True)
