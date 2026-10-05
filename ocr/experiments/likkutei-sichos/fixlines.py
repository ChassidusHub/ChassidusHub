"""Lines the assembler fixed go back into the training data (Shmuly 2026-10-05:
"make it go back to training data after we know it's a real error"). Each read
sicha is assembled again from its page layouts; a line assemble.reconcile() was
sure of (a note label the sequence settled, a mark renumbered from a gap) is
cut from the scan as the reader saw it (recog.PAD around its box) and written
with its fixed text as a training pair.

    fixlines.py <read dir with <vol>/lay/*.json> <pdf dir> <out dir> [vols...]"""
import glob, json, os, sys
import numpy as np
import pymupdf
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import assemble
from layout import deskew, scan
from recog import PAD


def main():
    read, pdfs, out = sys.argv[1:4]
    vols = sys.argv[4:] or sorted(os.listdir(read))
    n = kinds = 0
    count = {}
    os.makedirs(out, exist_ok=True)
    index = open(f'{out}/index.jsonl', 'w', encoding='utf-8')  # each pair, why it was fixed, and the reading it replaced
    for vol in vols:
        for f in sorted(glob.glob(f'{read}/{vol}/*.json')):
            d = json.load(open(f))
            stem = d['sicha']
            lays = {p['pdf_page']: json.load(open(f'{read}/{vol}/lay/{stem}_{p["pdf_page"]:02d}.json')) for p in d['pages']}
            assemble.assemble([(p['printed'], p['pdf_page'], lays[p['pdf_page']]) for p in d['pages']])
            doc = None
            for pg, lay in lays.items():
                lines = [l for key in ('body', 'notes') for col in lay[key] for l in col if l.get('fixed')]
                if not lines:
                    continue
                if doc is None:
                    doc = pymupdf.open(f'{pdfs}/{stem}.pdf')
                a = deskew(scan(doc, pg - 1))
                os.makedirs(f'{out}/{vol}', exist_ok=True)
                h, w = a.shape
                for i, l in enumerate(lines):
                    crop = a[max(0, l['y0'] - PAD):min(h, l['y1'] + PAD), max(0, l['x0'] - PAD):min(w, l['x1'] + PAD)]
                    name = f'{out}/{vol}/{stem}_{pg:02d}_f{i:02d}'
                    Image.fromarray(crop).save(name + '.png')
                    open(name + '.gt.txt', 'w', encoding='utf-8').write(assemble.unfaced(l['fixed']) + '\n')
                    index.write(json.dumps({'png': name + '.png', 'fix': l['fix'], 'read': l.get('text', ''), 'fixed': l['fixed']}, ensure_ascii=False) + '\n')
                    count[l['fix']] = count.get(l['fix'], 0) + 1
                    n += 1
    print(n, 'fixed lines written to', out, count)


if __name__ == '__main__':
    main()
