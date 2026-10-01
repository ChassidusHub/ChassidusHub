"""Read a list of line images with a model and keep everything a later step
needs: the plain (greedy) reading, the letter-by-letter probabilities the
network gave (so a word-list decoder or a second model can re-decide without
reading the scan again), and the true label.

    evalx.py <model> <list.txt> <out.npz> [--limit N]

The probabilities are stored in the network's own order, which is the
picture's left-to-right order (Hebrew reversed); decoders work in that order
and turn the result back into reading order with Kraken's own bidi step."""
import argparse, os, sys, time
import numpy as np
import torch
from PIL import Image
from kraken.configs import RecognitionInferenceConfig
from kraken.containers import Segmentation, BBoxLine
from kraken.lib.ctc_decoder import greedy_decoder
from kraken.tasks import RecognitionTaskModel

ap = argparse.ArgumentParser()
ap.add_argument('model')
ap.add_argument('list')
ap.add_argument('out')
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--threads', type=int, default=4)
ap.add_argument('--device', default='cpu')
args = ap.parse_args()
torch.set_num_threads(args.threads)
# Full float32 on the GPU too (cuDNN otherwise uses TF32 for convolutions), so a
# score here matches what the same model reads on a CPU.
torch.backends.cudnn.allow_tf32 = False
torch.backends.cuda.matmul.allow_tf32 = False

kept = {}


def capture(outputs, olens):
    # The softmax output (N, C, W) of the line just read, cut to its true length.
    o = outputs.float().cpu().numpy()
    kept['probs'] = o[0, :, :int(olens[0])].T.astype(np.float16) if olens is not None else o[0].T.astype(np.float16)
    return greedy_decoder(outputs, olens)


net = RecognitionTaskModel.load_model(args.model)
cfg = RecognitionInferenceConfig(text_direction='horizontal-rl', num_line_workers=0, decoder=capture,
                                 accelerator='gpu' if args.device.startswith('cuda') else 'cpu')
codec = net.net.codec
labels = [''] * (max(l for ls in codec.c2l.values() for l in ls) + 1)
for ch, ls in codec.c2l.items():
    if len(ls) == 1:
        labels[ls[0]] = ch

paths = [l.strip() for l in open(args.list) if l.strip()]
if args.limit:
    paths = paths[:args.limit]
gts, preds, probs = [], [], []
t = time.time()
for i, p in enumerate(paths):
    im = Image.open(p).convert('L')
    w, h = im.size
    seg = Segmentation(type='bbox', imagename=p, text_direction='horizontal-rl', script_detection=False,
                       lines=[BBoxLine(id='0', bbox=(0, 0, w, h), text_direction='horizontal-rl')])
    rec = next(iter(net.predict(im, seg, cfg)))
    gt = p[:-4] + '.gt.txt'
    gts.append(open(gt, encoding='utf-8').read().strip() if os.path.exists(gt) else '')
    preds.append(rec.prediction.strip())
    probs.append(kept['probs'])
    if i % 200 == 0:
        print(i, len(paths), round(time.time() - t), 's', flush=True)
arr = np.empty(len(probs), dtype=object)
arr[:] = probs
np.savez(args.out, paths=np.array(paths), gts=np.array(gts), preds=np.array(preds), probs=arr, labels=np.array(labels))
print('saved', args.out, len(paths), 'lines', round(time.time() - t), 's')
