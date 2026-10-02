"""One sicha, scan to page text: every page of its PDF read (layout, lines, stars,
faces), the printed page numbers taken from the running heads (falling back to
the chunk's start page plus the index), the pages assembled into one PageText
with its layout record. Writes <out>/<vol>_<start>.json {pageText, layout, pages:
[{pdf_page, printed, head}]}, and the per-page layouts under <out>/lay/.

    readsicha.py <model> <pdf>... --out DIR [--device cuda:0] [--threads N]
                 [--second <model> --vocab counts.txt [--lm words.bin]]

--second reads every line with a second reader too and keeps, line by line, the
reading the word check prefers (recog.vote_lines)."""
import json, os, re, sys, time
import numpy as np
import pymupdf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import assemble
from layout import deskew, scan


def printed_number(head, fallback):
    """The page number in a running head, if it reads as one near the fallback."""
    nums = [int(x) for x in re.findall(r'\d{1,3}', head or '')]
    near = [n for n in nums if abs(n - fallback) <= 2]
    return near[0] if near else fallback


def read_sicha(net, pdf, out):
    from recog import read_page  # after READ_DEVICE is set
    stem = os.path.basename(pdf)[:-4]
    vol, start = stem.split('_'); start = int(start)
    doc = pymupdf.open(pdf)
    pages = []
    os.makedirs(f'{out}/lay', exist_ok=True)
    for i in range(len(doc)):
        a = scan(doc, i)
        if a is None:
            continue
        a = deskew(a)
        lay = read_page(net, a)
        lay['shape'] = a.shape
        printed = printed_number(lay['head'].get('text', ''), start + i)
        pages.append({'pdf_page': i + 1, 'printed': printed, 'head': lay['head'].get('text', '')})
        json.dump(lay, open(f'{out}/lay/{stem}_{i + 1:02d}.json', 'w'), ensure_ascii=False, default=lambda o: int(o) if isinstance(o, np.integer) else float(o))
        pages[-1]['lay'] = lay
    pt, layout = assemble.assemble([(p['printed'], p['pdf_page'], p['lay']) for p in pages])
    for p in pages:
        p.pop('lay')
    json.dump({'sicha': stem, 'pageText': pt, 'layout': layout, 'pages': pages}, open(f'{out}/{stem}.json', 'w'), ensure_ascii=False, default=lambda o: int(o) if isinstance(o, np.integer) else float(o))
    return len(pages)


if __name__ == '__main__':
    args = sys.argv[1:]
    out = 'read'; device = None; threads = None; opt = {}
    for flag in ('--out', '--device', '--threads', '--second', '--vocab', '--lm'):
        if flag in args:
            k = args.index(flag); v = args[k + 1]; del args[k:k + 2]
            if flag == '--out': out = v
            elif flag == '--device': device = v
            elif flag == '--threads': threads = int(v)
            else: opt[flag[2:]] = v
    import torch
    if threads: torch.set_num_threads(threads)
    if device:
        os.environ['READ_DEVICE'] = device  # recog.CONFIG reads it when imported
    from recog import load
    net = load(args[0])
    if 'second' in opt:
        import recog
        recog.use_second(opt['second'], opt['vocab'], opt.get('lm'))
    os.makedirs(out, exist_ok=True)
    for pdf in args[1:]:
        t0 = time.time()
        try:
            n = read_sicha(net, pdf, out)
            print(f'{os.path.basename(pdf)} {n} pages {time.time() - t0:.0f}s', flush=True)
        except Exception as e:
            print(f'{os.path.basename(pdf)} FAILED {e!r}', flush=True)
