"""Find marks the typed text left out, by ink the model's reading does not
account for (see inkcheck.py). The typed text of the volumes sometimes drops
a dash or ". . ." at the start of a printed line, and a model trained on it
learns to drop them too; confidence can't see this, since a mark that was
never read has no confidence.

For each line: blobs of ink with no read letter near them. A long thin blob
at mid height is a dash, a row of two or more small round blobs is ". . .".
At the start of the line (the right edge) these are added to the label if
it lacks them; a dash at the end of the line too. Any other unexplained ink
marks the line unclear, and it is kept out of the focus drill.

    inkfix.py <model> <list.txt> <out.jsonl> [--shard i/n --device cuda:0]
    inkfix.py --apply 'out/ink_*.jsonl' [--write]   # count, and rewrite labels"""
import argparse, glob, json, os, sys, time, unicodedata
import numpy as np
from PIL import Image
from scipy import ndimage

nfd = lambda t: unicodedata.normalize('NFD', str(t)).strip()


def emitted_x(p, W):
    best = p.argmax(1); T = len(best)
    xs, prev = [], 0
    for t, b in enumerate(best):
        if b != 0 and b != prev:
            xs.append((t + 0.5) * W / T)
        prev = b
    return np.array(xs)


def blobs(im, xs, near=0.6, min_px=6):
    """Unexplained blobs: (x0, x1, y0, y1, size), right to left."""
    ink = np.asarray(im) < 128
    lab, _ = ndimage.label(ink)
    h = ink.shape[0]; pad = near * h; out = []
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        size = int((lab[sl] == k).sum())
        if size < min_px:
            continue
        x0, x1 = sl[1].start, sl[1].stop
        if not len(xs) or not ((xs >= x0 - pad) & (xs <= x1 + pad)).any():
            out.append((x0, x1, sl[0].start, sl[0].stop, size))
    return sorted(out, key=lambda b: -b[1])


def shape(b, h):
    x0, x1, y0, y1, size = b
    w, bh = x1 - x0, y1 - y0
    if w >= 2.5 * bh and bh <= 0.25 * h and w >= 0.4 * h:
        return 'dash'
    if w <= 0.3 * h and bh <= 0.3 * h and 0.5 <= w / max(bh, 1) <= 2 and size >= 0.5 * w * bh:
        return 'dot'
    return 'other'


def decide(label, bl, W, h, edge=0.15):
    """(new label, action): action is 'ok', 'fixed:<what>' or 'unclear'."""
    if not bl:
        return label, 'ok'
    kinds = [shape(b, h) for b in bl]
    if 'other' in kinds:
        return label, 'unclear'
    ink = np.asarray([[b[0], b[1]] for b in bl])
    lo, hi = ink.min(), ink.max()
    # all the blobs near the right edge (the line's start) or the left (its end)
    start = hi >= W - edge * h - 8 and all(b[0] >= W - 3 * h for b in bl)
    end = lo <= edge * h + 8 and all(b[1] <= 3 * h for b in bl)
    if kinds == ['dash'] and start:
        return (label, 'ok') if label.startswith('—') else ('— ' + label, 'fixed:start-dash')
    if kinds == ['dash'] and end:
        return (label, 'ok') if label.endswith('—') else (label + ' —', 'fixed:end-dash')
    if set(kinds) == {'dot'} and len(kinds) >= 2 and start:
        return (label, 'ok') if label.startswith('.') else ('. . . ' + label, 'fixed:start-dots')
    return label, 'unclear'


def typed(path):
    g = path.rsplit('.', 1)[0]
    return nfd(open(g + '.gt.txt', encoding='utf-8').read())


def read_main(a):
    import torch
    from kraken.configs import RecognitionInferenceConfig
    from kraken.containers import Segmentation, BBoxLine
    from kraken.lib.ctc_decoder import greedy_decoder
    from kraken.tasks import RecognitionTaskModel
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
    paths = [l.strip() for l in open(a.list) if l.strip()][i::n]
    t = time.time()
    with open(a.out, 'w', encoding='utf-8') as f:
        for k, p in enumerate(paths):
            try:
                im = Image.open(p).convert('L'); w, h = im.size
                seg = Segmentation(type='bbox', imagename=p, text_direction='horizontal-rl', script_detection=False,
                                   lines=[BBoxLine(id='0', bbox=(0, 0, w, h), text_direction='horizontal-rl')])
                next(iter(net.predict(im, seg, cfg)))
                gt = typed(p)
                new, act = decide(gt, blobs(im, emitted_x(kept['p'], w)), w, h)
                f.write(json.dumps({'p': p, 'a': act, 'old': gt, 'new': new if act.startswith('fixed') else None}, ensure_ascii=False) + '\n')
            except Exception as e:
                print('skip', p, repr(e)[:200], flush=True)
            if k % 1000 == 0:
                print(f'ink {i}: {k}/{len(paths)} {round(time.time() - t)} s', flush=True)
    print(f'ink {i}: done {len(paths)} {round(time.time() - t)} s', flush=True)


def apply_main(a):
    counts, unclear = {}, []
    for fn in sorted(glob.glob(a.src)):
        for l in open(fn, encoding='utf-8'):
            r = json.loads(l); counts[r['a']] = counts.get(r['a'], 0) + 1
            if r['a'] == 'unclear':
                unclear.append(r['p'])
            elif r['new'] and a.write:
                open(r['p'].rsplit('.', 1)[0] + '.gt.txt', 'w', encoding='utf-8').write(r['new'] + '\n')
    if a.unclear:
        open(a.unclear, 'w').write(''.join(p + '\n' for p in unclear))
    print('ink:', counts, flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('model', nargs='?'); ap.add_argument('list', nargs='?'); ap.add_argument('out', nargs='?')
    ap.add_argument('--shard', default='0/1'); ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--device', default='cpu')
    ap.add_argument('--apply'); ap.add_argument('--write', action='store_true'); ap.add_argument('--unclear')
    a = ap.parse_args()
    if a.apply:
        a.src = a.apply; apply_main(a)
    else:
        read_main(a)
