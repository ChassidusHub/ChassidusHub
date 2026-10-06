"""Reads a whole multi-volume subject index with Kraken (volume letters from
Tesseract when Kraken drops them) and writes the parsed entries.
    python3 run_index.py <pdf> <model> <first vol> <last vol> <out.json> [first page last page]
A book holding more than one subject index (vols 10-14 and then vol 15) needs
the page range; a one-volume index is read as vol <first> with no letters."""
import json, os, re, sys
os.environ['OMP_THREAD_LIMIT'] = '1'
from concurrent.futures import ProcessPoolExecutor
import pymupdf
import ocr_index as o
import eval_volume as ev


def head(args):
    f, p = args
    return o.tesseract(o.render(pymupdf.open(f), p)[:420], ['-l', 'heb', '--psm', '6'])


def relabel(entries, first, last):
    """A one-volume index has no volume letters; the parser files it all as vol 1."""
    if first == last:
        for e in entries:
            for r in e['refs']:
                r['volume'] = o.hebrew_numeral(first)
    return entries


def job(args):
    f, model, p = args
    return ev.ocr_volume(pymupdf.open(f), [p], ev.kraken_reader(model))


if __name__ == '__main__':
    f, model, first, last, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
    n = len(pymupdf.open(f))
    with ProcessPoolExecutor(4) as ex:
        heads = list(ex.map(head, [(f, p) for p in range(n)]))
        pages = [p for p, h in enumerate(heads) if re.search('ענ[י]?נים', h)]
        if len(sys.argv) > 7:
            pages = [p for p in pages if int(sys.argv[6]) <= p <= int(sys.argv[7])]
        print('pages', pages, flush=True)
        columns = [c for r in ex.map(job, [(f, model, p) for p in pages]) for c in r]
    json.dump({'pages': pages, 'lines': [[l['text'] for l in c] for c in columns],
               'entries': relabel(o.parse(columns, 1 if first == last else first, 1 if first == last else last), first, last)}, open(out, 'w'), ensure_ascii=False, indent=0)
    print('done', len(pages), 'pages')
