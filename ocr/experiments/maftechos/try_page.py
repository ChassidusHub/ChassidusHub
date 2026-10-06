"""Reads index pages with both readers and prints them line by line, for checking by eye.
    python3 try_page.py <pdf> <model> <page> [page ...]"""
import json, sys
import pymupdf
import eval_volume as ev

pdf = pymupdf.open(sys.argv[1])
pages = [int(p) for p in sys.argv[3:]]
tess = ev.ocr_volume(pdf, pages)
kr = ev.ocr_volume(pdf, pages, ev.kraken_reader(sys.argv[2]))
out = [[{'kraken': k['text'], 'tesseract': t['text']} for k, t in zip(kc, tc)] for kc, tc in zip(kr, tess)]
json.dump(out, open('try_' + '_'.join(map(str, pages)) + '.json', 'w'), ensure_ascii=False, indent=0)
for c in out:
    print('--- column')
    for l in c:
        print(('   ' if l['kraken'] == l['tesseract'] else '≠  ') + l['kraken'] + ('' if l['kraken'] == l['tesseract'] else '\n     T: ' + l['tesseract']))
