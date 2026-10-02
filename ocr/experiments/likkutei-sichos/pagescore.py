"""Score the page stage against the typed truth: a vol 39 page is laid out,
read with a model and put together as RebbeHub page text (assemble.py); then
its paragraphs, note marks and notes are compared with the Chabad Library's
typed page (truth/<vol>_<page>.json, which keeps paragraphs and marks).

    pagescore.py <model> <vol> <pages: 100-109 or 100,105> [--threads 1 --vocab lm/vocab_big.txt --out ev/pagescore.jsonl]

Per page: paragraphs in the truth and in the reading and how many match
(80+ letters in common), letters right over the body text, note marks found
at the right word / missed / extra, notes found by label and their letters."""
import argparse, glob, json, os, re, sys, unicodedata
import numpy as np, pymupdf
from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein
EXP = '/home/user/RebbeHub-OCR/experiments/likkutei-sichos'
sys.path.insert(0, EXP)
import assemble
from recog import load, read_page
from layout import deskew, scan
from pairs import printed, SHY, norm

nfd = lambda t: unicodedata.normalize('NFD', t)
DOTS = re.compile(r'\s*\.\s*(?=\.)|(?<=\.)\s*\.\s*')  # '. . .' and ' ..' count the same


def same(t):
    return DOTS.sub('.', t)
MARK = re.compile(r'(\*{0,3}\d+|\*{1,3})\)')


def truth_page(vol, page):
    f = f'truth/{vol}_{page:04d}.json'
    if not os.path.exists(f):
        return None
    t = json.load(open(f))
    body = re.sub(r'\[/?quotation\]', '', t['body'])  # the typed text sets a date-said line as a quotation
    paras = [same(norm(' '.join(printed(w) for w in l.replace(SHY, '').split()))) for l in body.split('\n') if l.strip()]
    dates = [same(norm(' '.join(printed(w) for w in m.group(1).replace(SHY, '').split()))) for m in re.finditer(r'\[quotation\](.*?)\[/quotation\]', t['body'])]
    notes = {k: same(norm(' '.join(printed(w) for w in v.replace(SHY, '').split()))) for k, v in t['notes'].items()}
    return paras, notes, dates


def out_page(pt):
    v = pt['versions'][0]
    paras, kinds = [], []

    def show(runs):
        out = ''
        for r in runs:
            if 'text' in r:
                out += r['text']
            elif 'note' in r:
                out += r['note'][1:].replace('s', '*') + ')'
        return same(norm(out))

    def walk(segs):
        for s in segs:
            if s['kind'] == 'section':
                walk(s['children'])
            else:
                paras.append(show(s['text'])); kinds.append(s['kind'])
    walk(v['segments'])
    notes = {n.get('label', str(n.get('n', '?'))): show(n['text']) for n in v['notes']}
    return paras, kinds, notes


def marks(paras):
    """(label, the word it hangs on) for every note mark in a text."""
    out = []
    for p in paras:
        for m in MARK.finditer(p):
            before = p[:m.start()].split()
            out.append((m.group(1), re.sub(r'[^א-ת]', '', before[-1]) if before else ''))
    return out


def align(a, b):
    """Pairs of paragraphs (i, j) that match, by a plain sequence alignment on how alike they are."""
    n, m = len(a), len(b)
    S = np.zeros((n + 1, m + 1)); P = np.zeros((n + 1, m + 1), int)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            r = fuzz.ratio(a[i - 1], b[j - 1]) / 100
            S[i, j], P[i, j] = max((S[i - 1, j - 1] + (r if r >= 0.8 else 0), 0), (S[i - 1, j], 1), (S[i, j - 1], 2))
    pairs, i, j = [], n, m
    while i and j:
        if P[i, j] == 0:
            if fuzz.ratio(a[i - 1], b[j - 1]) >= 80:
                pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif P[i, j] == 1:
            i -= 1
        else:
            j -= 1
    return pairs[::-1]


def find_page(vol, page):
    """The pdf chunk and index holding this printed page (chunks start at their first printed page)."""
    starts = sorted(int(os.path.basename(f)[3:7]) for f in glob.glob(f'pdf/{vol}_*.pdf'))
    cands = [s for s in starts if s <= page]
    if not cands:
        return None, None
    start = cands[-1]
    doc = pymupdf.open(f'pdf/{vol}_{start:04d}.pdf')
    return doc, page - start


CACHE = {}  # printed page -> (lay, pdf page, chunk start): each page is read once


def read_lay(net, vol, page, truth):
    """The page read, found among the pdf's pages by its truth (a chunk's first page may be off by one)."""
    if page in CACHE:
        return CACHE[page]
    doc, idx = find_page(vol, page)
    best = None
    if doc is not None:
        for d in (0, -1, 1):
            if not 0 <= idx + d < len(doc):
                continue
            a = scan(doc, idx + d)
            if a is None or a.shape[1] > 2200:
                continue
            a = deskew(a)
            lay = read_page(net, a); lay['shape'] = a.shape
            pt, _ = assemble.assemble([(page, idx + d + 1, lay)])
            oparas, _, _ = out_page(pt)
            r = fuzz.ratio(' '.join(oparas)[:400], ' '.join(truth[0])[:400]) if truth else 100
            if best is None or r > best[0]:
                best = (r, lay, idx + d + 1)
            if r >= 80:
                break
    CACHE[page] = None if best is None or best[0] < 50 else (best[1], best[2])
    return CACHE[page]


def score_page(net, vol, page, truth):
    tparas, tnotes, tdates = truth
    got = read_lay(net, vol, page, truth)
    if got is None:
        return {'page': page, 'error': 'no pdf page matches the truth'}
    lay, pdf_page = got
    pt, layout = assemble.assemble([(page, pdf_page, lay)])
    oparas, kinds, onotes = out_page(pt)
    # A note that runs on to the next page: the typed page holds all of it, so the
    # next page is read too and the notes that start on this page are taken whole.
    nxt = read_lay(net, vol, page + 1, truth_page(vol, page + 1)) if find_page(vol, page + 1)[0] is not None else None
    if nxt and nxt[1] == pdf_page + 1:
        pt2, _ = assemble.assemble([(page, pdf_page, lay), (page + 1, pdf_page + 1, nxt[0])])
        v = pt2['versions'][0]
        onotes = {}
        for n in v['notes']:
            if n['printed'] and n['printed'][0]['page'] == pdf_page:
                onotes[n.get('label', str(n.get('n', '?')))] = same(norm(''.join(r.get('text', '') or (r['note'][1:].replace('s', '*') + ')' if 'note' in r else '') for r in n['text'])))
    onotes.pop('?', None)  # a note column opening mid-note continues the page before: not this page's
    pairs = align(tparas, oparas)
    tb, ob = nfd('\n'.join(tparas)), nfd('\n'.join(oparas))
    dist = Levenshtein.distance(tb, ob)
    tm, om = marks(tparas), marks(oparas)
    found = sum(1 for x in tm if x in om)
    odates = [p for p, k in zip(oparas, kinds) if k == 'date']
    row = {'page': page, 'pdf_page': pdf_page, 'truth_paras': len(tparas), 'read_paras': len(oparas), 'matched_paras': len(pairs),
           'headings': kinds.count('heading'), 'dates_truth': len(tdates), 'dates_found': sum(1 for d in tdates if d in odates), 'dates_extra': [d for d in odates if d not in tdates], 'body_letters': len(tb), 'body_errors': dist,
           'marks_truth': len(tm), 'marks_found': found, 'marks_missed': [f'{l}:{w}' for l, w in tm if (l, w) not in om],
           'marks_extra': [f'{l}:{w}' for l, w in om if (l, w) not in tm],
           'notes_truth': len(tnotes), 'notes_found': sum(1 for k in tnotes if k in onotes),
           'notes_missing': [k for k in tnotes if k not in onotes], 'notes_extra': [k for k in onotes if k not in tnotes],
           'note_letters': sum(len(nfd(tnotes[k])) for k in tnotes if k in onotes),
           'note_errors': sum(Levenshtein.distance(nfd(tnotes[k]), nfd(onotes[k])) for k in tnotes if k in onotes),
           'head': layout[0]['head_text']}
    row['paras'] = {'truth': tparas, 'read': oparas, 'pairs': pairs}
    row['notes'] = {'truth': tnotes, 'read': onotes}
    return row


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('model'); ap.add_argument('vol', type=int); ap.add_argument('pages')
    ap.add_argument('--threads', type=int, default=1); ap.add_argument('--vocab'); ap.add_argument('--out', default='ev/pagescore.jsonl')
    a = ap.parse_args()
    import torch; torch.set_num_threads(a.threads)
    if a.vocab:
        assemble.VOCAB = {}
        for l in open(a.vocab, encoding='utf-8'):
            w, n = l.rsplit(' ', 1); assemble.VOCAB[w] = int(n)
        comp = os.path.join(os.path.dirname(a.vocab), 'compounds.txt')
        if os.path.exists(comp):
            assemble.COMPOUNDS = {l.split(' ')[0] for l in open(comp, encoding='utf-8')}
    pages = []
    for part in a.pages.split(','):
        lo, _, hi = part.partition('-'); pages += list(range(int(lo), int(hi or lo) + 1))
    net = load(a.model)
    tot = {}
    with open(a.out, 'a', encoding='utf-8') as f:
        for p in pages:
            truth = truth_page(a.vol, p)
            if truth is None:
                print(p, 'no truth'); continue
            row = score_page(net, a.vol, p, truth)
            f.write(json.dumps(row, ensure_ascii=False) + '\n'); f.flush()
            if 'error' in row:
                print(p, row['error'], flush=True); continue
            for k, v in row.items():
                if isinstance(v, int):
                    tot[k] = tot.get(k, 0) + v
            print(p, f"paras {row['matched_paras']}/{row['truth_paras']} (read {row['read_paras']})",
                  f"letters {100 * (1 - row['body_errors'] / max(1, row['body_letters'])):.2f}%",
                  f"marks {row['marks_found']}/{row['marks_truth']}", f"notes {row['notes_found']}/{row['notes_truth']}",
                  f"note letters {100 * (1 - row['note_errors'] / max(1, row['note_letters'])):.2f}%", flush=True)
    if tot:
        print('TOTAL', json.dumps({**{k: tot.get(k, 0) for k in ('truth_paras', 'read_paras', 'matched_paras', 'marks_truth', 'marks_found', 'notes_truth', 'notes_found', 'dates_truth', 'dates_found')},
                                   'body_acc': round(100 * (1 - tot['body_errors'] / max(1, tot['body_letters'])), 2),
                                   'note_acc': round(100 * (1 - tot['note_errors'] / max(1, tot['note_letters'])), 2)}))
