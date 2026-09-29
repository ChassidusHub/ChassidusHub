"""Cuts line images from a multi-volume index the way the Kraken reader sees them,
with Kraken's reading, for labelling by hand: lines with bracketed pages or
impossible numbers, plus every Nth line as a plain sample.
    python3 export_lines.py <pdf> <model> <idx.json from run_index> <out dir> [every]"""
import json, os, re, sys
os.environ['OMP_THREAD_LIMIT'] = '1'
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import pymupdf
from PIL import Image
import ocr_index as o
import eval_volume as ev

HARD = lambda t: bool(re.search(r'\[\d+\]', t)) or any(int(n) > 1500 for n in re.findall(r'(?<!\d)\d{4,}(?!\d)', t))


def job(args):
    f, model, p = args
    pdf = pymupdf.open(f)
    a = o.deskew(o.render(pdf, p))
    top, bottom = o.body_bounds(a)
    gutter = o.split_columns(a, top, bottom)
    read = ev.kraken_reader(model)
    out = []
    for c, col in enumerate([a[top:bottom, gutter:], a[top:bottom, :gutter]] if gutter else [a[top:bottom]]):
        lines = read(col, o.ocr_column(col))
        padded = np.pad(col, 40, constant_values=255)
        for i, l in enumerate(lines):
            y0, y1 = max(0, l['y'] - 6), l['y'] + l['h'] + 6
            xs = np.where((padded[l['y']:l['y'] + l['h']] < 128).sum(0) > 0)[0]
            x0 = min(l['x_left'], xs.min()) - 10 if len(xs) else l['x_left'] - 10
            x1 = max(l['x_right'], xs.max() + 1) + 10 if len(xs) else l['x_right'] + 10
            out.append({'page': p, 'col': c, 'n': i, 'text': l['text'], 'crop': padded[y0:y1, max(0, x0):x1]})
    return out


if __name__ == '__main__':
    f, model, idx, out = sys.argv[1:5]
    every = int(sys.argv[5]) if len(sys.argv) > 5 else 25
    os.makedirs(out, exist_ok=True)
    pages = json.load(open(idx))['pages']
    k, rows = 0, []
    with ProcessPoolExecutor(4) as ex:
        for lines in ex.map(job, [(f, model, p) for p in pages]):
            for l in lines:
                k += 1
                if HARD(l['text']) or k % every == 0:
                    name = f"p{l['page']:03d}c{l['col']}n{l['n']:02d}"
                    Image.fromarray(l['crop']).save(f'{out}/{name}.png')
                    rows.append({'name': name, 'kraken': l['text'], 'hard': HARD(l['text'])})
    json.dump(rows, open(f'{out}/lines.json', 'w'), ensure_ascii=False, indent=0)
    print(len(rows), 'lines,', sum(r['hard'] for r in rows), 'hard')
