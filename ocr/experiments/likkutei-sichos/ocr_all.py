"""First pass over every downloaded sicha: each page's layout and the
current model's reading of each line, to ocr/<vol>_<start>_<pdf page>.json.
Run as N workers: python3 ocr_all.py <model> <worker> <of> [pdf glob, default pdf/*.pdf]."""
import glob, io, json, os, sys
import numpy as np
import pymupdf
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from recog import load, read_page
from layout import deskew, scan


def pages(pdf_path):
    d = pymupdf.open(pdf_path)
    for p in range(len(d)):
        a = scan(d, p)
        if a is not None:
            yield p, a


if __name__ == '__main__':
    model, worker, of = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    import torch; torch.set_num_threads(1)
    net = load(model)
    os.makedirs('ocr', exist_ok=True)
    for k, f in enumerate(sorted(glob.glob(sys.argv[4] if len(sys.argv) > 4 else 'pdf/*.pdf'))):
        if k % of != worker:
            continue
        stem = os.path.basename(f)[:-4]
        if os.path.exists(f'ocr/{stem}.done'):
            continue
        for p, a in pages(f):
            a = deskew(a)
            if a.shape[1] > 2200:  # not a body page (a square scan of something else)
                continue
            lay = read_page(net, a)
            lay['shape'] = a.shape
            json.dump(lay, open(f'ocr/{stem}_{p:02d}.json', 'w'), ensure_ascii=False)
        open(f'ocr/{stem}.done', 'w').close()
        print(stem, flush=True)
