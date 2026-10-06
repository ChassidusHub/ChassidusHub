"""Read line images with a model for relabel.py: the greedy reading of each
line in reading order and how sure the model was of each letter, one JSON
line per image. Several of these share one GPU (--shard i/n), since a single
line at a time leaves most of the card idle.

    relabel_read.py <model> <list.txt> <out.jsonl> [--shard i/n --device cuda:0]"""
import argparse, json, sys, time
import numpy as np
import torch
from PIL import Image
from kraken.configs import RecognitionInferenceConfig
from kraken.containers import Segmentation, BBoxLine
from kraken.lib.ctc_decoder import greedy_decoder
from kraken.tasks import RecognitionTaskModel
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from relabel import reading

ap = argparse.ArgumentParser()
ap.add_argument('model')
ap.add_argument('list')
ap.add_argument('out')
ap.add_argument('--shard', default='0/1')
ap.add_argument('--threads', type=int, default=2)
ap.add_argument('--device', default='cpu')
a = ap.parse_args()
torch.set_num_threads(a.threads)
i, n = map(int, a.shard.split('/'))
kept = {}


def capture(outputs, olens):
    o = outputs.float().cpu().numpy()
    kept['p'] = o[0, :, :int(olens[0])].T if olens is not None else o[0].T
    return greedy_decoder(outputs, olens)


net = RecognitionTaskModel.load_model(a.model)
cfg = RecognitionInferenceConfig(text_direction='horizontal-rl', num_line_workers=0, decoder=capture,
                                 accelerator='gpu' if a.device.startswith('cuda') else 'cpu')
codec = net.net.codec
labels = [''] * (max(l for ls in codec.c2l.values() for l in ls) + 1)
for ch, ls in codec.c2l.items():
    if len(ls) == 1:
        labels[ls[0]] = ch
labels = [l if (l or k == 0) else chr(0xE000 + k) for k, l in enumerate(labels)]
paths = [l.strip() for l in open(a.list) if l.strip()][i::n]
t = time.time()
with open(a.out, 'w', encoding='utf-8') as f:
    for k, p in enumerate(paths):
        try:
            im = Image.open(p).convert('L')
            w, h = im.size
            seg = Segmentation(type='bbox', imagename=p, text_direction='horizontal-rl', script_detection=False,
                               lines=[BBoxLine(id='0', bbox=(0, 0, w, h), text_direction='horizontal-rl')])
            next(iter(net.predict(im, seg, cfg)))
            text, cs = reading(kept['p'], labels)
            f.write(json.dumps({'p': p, 't': text, 'c': [round(float(c), 2) for c in cs]}, ensure_ascii=False) + '\n')
        except Exception as e:
            print('skip', p, repr(e)[:200], flush=True)
        if k % 1000 == 0:
            print(f'shard {i}: {k}/{len(paths)} {round(time.time() - t)} s', flush=True)
print(f'shard {i}: done {len(paths)} {round(time.time() - t)} s', flush=True)
