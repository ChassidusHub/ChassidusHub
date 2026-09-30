"""First pass over every downloaded sicha: each page's layout and the
current model's reading of each line, to ocr/<vol>_<start>_<pdf page>.json.
Run as N workers: python3 ocr_all.py <model> <worker> <of>."""
import glob, io, json, os, sys
import numpy as np
import pymupdf
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from recog import load, read_page
from layout import deskew


def pages(pdf_path):
    d = pymupdf.open(pdf_path)
    for p in range(len(d)):
        imgs = d[p].get_images()
        if not imgs:
            continue
        im = Image.open(io.BytesIO(d.extract_image(imgs[0][0])['image'])).convert('L')
        yield p, np.array(im)


if __name__ == '__main__':
    model, worker, of = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    import torch; torch.set_num_threads(1)
    net = load(model)
    os.makedirs('ocr', exist_ok=True)
    for k, f in enumerate(sorted(glob.glob('pdf/*.pdf'))):
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
