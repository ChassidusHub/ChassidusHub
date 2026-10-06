"""Silver pairs for the short lines build_pairs.py skips: topic headings
("ארי':") and page numbers alone on a line ("329"). A heading line is kept
when round 1's reading nearly matches a topic of the typed copy, and labelled
with that topic and its colon; a number line when Kraken and Tesseract read
the same number.
    python3 short_pairs.py <pdf> <typed.json> <model> <out dir>"""
import html, json, os, re, sys
os.environ['OMP_THREAD_LIMIT'] = '1'
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import pymupdf
from PIL import Image
from rapidfuzz import fuzz, process
import ocr_index as o
import eval_volume as ev


def job(args):
    f, model, p = args
    a = o.deskew(o.render(pymupdf.open(f), p))
    top, bottom = o.body_bounds(a)
    gutter = o.split_columns(a, top, bottom)
    read = ev.kraken_reader(model)
    out = []
    for col in ([a[top:bottom, gutter:], a[top:bottom, :gutter]] if gutter else [a[top:bottom]]):
        lines = o.ocr_column(col)
        tess = [l['text'] for l in lines]
        lines = read(col, lines)
        padded = np.pad(col, 40, constant_values=255)
        for l, t in zip(lines, tess):
            xs = np.where((padded[l['y']:l['y'] + l['h']] < 128).sum(0) > 0)[0]
            x0 = min(l['x_left'], xs.min()) - 10 if len(xs) else l['x_left'] - 10
            x1 = max(l['x_right'], xs.max() + 1) + 10 if len(xs) else l['x_right'] + 10
            out.append({'kraken': l['text'], 'tesseract': t, 'crop': padded[max(0, l['y'] - 6):l['y'] + l['h'] + 6, max(0, x0):x1]})
    return out


if __name__ == '__main__':
    f, typed, model, out = sys.argv[1:5]
    os.makedirs(out, exist_ok=True)
    topics = sorted({html.unescape(e['topic']).strip() for e in json.load(open(typed))})
    pdf = pymupdf.open(f)
    heads = [o.tesseract(o.render(pdf, p)[:420], ['-l', 'heb', '--psm', '6']) for p in range(len(pdf))]
    pages = [p for p, h in enumerate(heads) if re.search('ענ[י]?נים', h)]
    k = heads_n = nums_n = 0
    with ProcessPoolExecutor(4) as ex:
        for lines in ex.map(job, [(f, model, p) for p in pages]):
            for l in lines:
                kr = l['kraken'].strip()
                label = None
                if len(kr) <= 40 and not re.search(r'\d', kr):
                    m = process.extractOne(kr.rstrip(':').strip(), topics, scorer=fuzz.ratio)
                    if m and m[1] >= 90:
                        label = m[0] + ':'
                        heads_n += 1
                elif re.fullmatch(r'\.?\s*\d{1,4}\.?', kr):
                    digits = re.sub(r'\D', '', kr)
                    if re.sub(r'\D', '', l['tesseract']) == digits:
                        label = digits + ('.' if kr.endswith('.') else '')
                        nums_n += 1
                if label:
                    Image.fromarray(l['crop']).save(f'{out}/{k:05d}.png')
                    open(f'{out}/{k:05d}.gt.txt', 'w').write(label + '\n')
                    k += 1
    print(f, 'headings', heads_n, 'numbers', nums_n)
