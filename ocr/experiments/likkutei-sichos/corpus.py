"""A word corpus for the OCR word model from the whole Chabad Library crawl
(68,882 pages, 350 M characters), not only the 132k paired lines of vols
30-38: the reader must know the words of the Rebbeim's sefarim well enough
to tell אלקות from אלקוח. Likkutei Sichos vol 39 is left out, since the
test lines come from it.

Pages come as the site's HTML with [ftnref_<id>_<n>] note shortcodes; a
printed line shows the note as "n)" stuck to the word, so that is what the
corpus gets. The output is one short line per row, NFD, in logical order
(big_log.txt) and in the visual order the network reads (big_vis.txt).

    corpus.py <texts dir> <tree.json> <out prefix> [--skip 1301850001]"""
import argparse, glob, html, json, os, re, sys, unicodedata
from kraken.lib.bidi import get_display

ap = argparse.ArgumentParser()
ap.add_argument('texts'); ap.add_argument('tree'); ap.add_argument('out')
ap.add_argument('--skip', default='1301850001', help='tree nodes whose pages are left out, comma separated')
a = ap.parse_args()

nodes = json.load(open(a.tree))['nodes']
skip = set(a.skip.split(','))


def skipped(pid):
    n = nodes.get(str(pid)); seen = 0
    while n and seen < 30:
        if str(pid) in skip:
            return True
        pid = n.get('parent'); n = nodes.get(str(pid)); seen += 1
    return False


XML = re.compile(r'<(xml|style|script)\b.*?</\1>', re.S)
COND = re.compile(r'\[if\b.*?\[endif\]', re.S)
TAG = re.compile(r'<[^>]+>')
NOTE = re.compile(r'\[ftnref_\d+_([^\]\s]+)\]')
NOTE2 = re.compile(r'\[ftn_\d+_([^\]\s]+)\]\)?')
SHORT = re.compile(r'\[[a-z_]+[^\]]*\]')
nfd = lambda t: unicodedata.normalize('NFD', t)


def clean(t):
    t = XML.sub(' ', t); t = COND.sub(' ', t)
    t = re.sub(r'</?(p|div|br|li|tr|h\d)\b[^>]*>', '\n', t)
    t = TAG.sub('', t); t = html.unescape(t)
    t = NOTE.sub(r'\1)', t); t = NOTE2.sub(r'\1)', t); t = SHORT.sub(' ', t)
    t = t.replace('­', '').replace('\xa0', ' ')
    # the print opens a quotation with „ where the site has a plain "
    t = re.sub(r'(^|[\s(\[—־])"', '\\1„', t)
    return t


def lines(t):
    for raw in t.split('\n'):
        raw = ' '.join(raw.split())
        if not raw:
            continue
        # long rows cut at sentence ends, so a row is about a printed line or two
        parts, cur = [], []
        for w in raw.split(' '):
            cur.append(w)
            if len(cur) >= 10 and w[-1:] in '.:;?!"' or len(cur) >= 25:
                parts.append(' '.join(cur)); cur = []
        if cur:
            parts.append(' '.join(cur))
        for p in parts:
            if re.search(r'[א-ת]', p):
                yield nfd(p)


n_pages = n_lines = n_skip = 0
with open(a.out + '_log.txt', 'w', encoding='utf-8') as flog, open(a.out + '_vis.txt', 'w', encoding='utf-8') as fvis:
    for fn in sorted(glob.glob(os.path.join(a.texts, '*.jsonl'))):
        for l in open(fn, encoding='utf-8'):
            r = json.loads(l)
            if skipped(r['id']):
                n_skip += 1; continue
            n_pages += 1
            for t in (r.get('text') or '', r.get('haoros') or ''):
                for ln in lines(clean(t)):
                    flog.write(ln + '\n'); fvis.write(get_display(ln, base_dir='R') + '\n'); n_lines += 1
        print(os.path.basename(fn), n_pages, 'pages', n_lines, 'lines', flush=True)
print('done:', n_pages, 'pages,', n_skip, 'skipped,', n_lines, 'lines')
