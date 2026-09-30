"""A sicha's read lines put back together as RebbeHub page text
(packages/model/src/pageText.ts): paragraphs, not printed lines; each
footnote mark a link to its note; the printed page numbers kept as
markers where each page begins; every paragraph's place on the scan kept
so a checker can see it there. All of it machine-made, and labelled so.

A paragraph starts where a line is indented, or after a line that stops
short; a word broken at a line end with - is joined again. A note starts
at a line opening with its number, N) or *N); a line without one goes on
the note before it, even over a column or a page."""
import glob, json, re, sys

ORIGIN = {'by': 'ocr:kraken-rebbehub-ls'}
MARK = re.compile(r'(?<=\S)(\*?\d{1,3})\)')
NOTE_START = re.compile(r'^(\*?\d{1,3})\)\s*')


def note_id(label):
    return 'n' + label.replace('*', 's')


def edges(lines):
    xs1 = sorted(l['x1'] for l in lines)
    xs0 = sorted(l['x0'] for l in lines)
    return xs0[len(xs0) // 10] if xs0 else 0, xs1[len(xs1) * 9 // 10] if xs1 else 0


def runs(text):
    """Words with footnote marks as links."""
    out, pos = [], 0
    for m in MARK.finditer(text):
        if m.start() > pos:
            out.append({'text': text[pos:m.start()]})
        out.append({'note': note_id(m.group(1))})
        pos = m.end()
    if pos < len(text):
        out.append({'text': text[pos:]})
    return out


def join(a, b):
    """Two printed lines as one run of words: a word broken with - joined again."""
    if not a:
        return b
    return a[:-1] + b if a.endswith('-') else a + ' ' + b


def box(line, shape, page):
    h, w = shape
    return {'page': page, 'box': [round(line['x0'] / w, 4), round(line['y0'] / h, 4), round((line['x1'] - line['x0']) / w, 4), round((line['y1'] - line['y0']) / h, 4)]}


def merge_box(boxes, b):
    """One box per column or page a paragraph runs over."""
    if boxes and boxes[-1]['page'] == b['page'] and abs(boxes[-1]['box'][0] - b['box'][0]) < 0.1:
        x0, y0, bw, bh = boxes[-1]['box']
        nx0, ny0, nw, nh = b['box']
        l, t, r, bot = min(x0, nx0), min(y0, ny0), max(x0 + bw, nx0 + nw), max(y0 + bh, ny0 + nh)
        boxes[-1]['box'] = [round(l, 4), round(t, 4), round(r - l, 4), round(bot - t, 4)]
    else:
        boxes.append(b)


def assemble(pages):
    """pages: [(printed page, pdf page from 1, layout with read lines)] in order -> PageText."""
    paras, notes = [], []
    cur = None  # the paragraph being built: {'parts': [str | marker], 'boxes': []}
    note = None
    for printed, pdf_page, lay in pages:
        shape = lay['shape']
        first_on_page = True
        for col in lay['body']:
            if not col:
                continue
            left, right = edges(col)
            prev_short = False
            for i, line in enumerate(col):
                text = line.get('text', '').strip()
                if not text:
                    continue
                indented = line['x1'] < right - 25
                short = line['x0'] > left + 40
                if cur is None or indented or (i > 0 and prev_short):
                    cur = {'parts': [], 'boxes': [], 'heading': indented and short and len(text) < 40}
                    paras.append(cur)
                if first_on_page:
                    cur['parts'].append({'marker': str(printed)})
                    first_on_page = False
                if cur['parts'] and isinstance(cur['parts'][-1], str):
                    cur['parts'][-1] = join(cur['parts'][-1], text)
                else:
                    cur['parts'].append(text)
                merge_box(cur['boxes'], box(line, shape, pdf_page))
                prev_short = short
        for col in lay['notes']:
            for line in col:
                text = line.get('text', '').strip()
                if not text:
                    continue
                m = NOTE_START.match(text)
                if m or note is None:
                    label = m.group(1) if m else '?'
                    note = {'label': label, 'text': text[m.end():] if m else text, 'boxes': []}
                    notes.append(note)
                else:
                    note['text'] = join(note['text'], text)
                merge_box(note['boxes'], box(line, shape, pdf_page))
    segments = []
    for k, p in enumerate(paras, 1):
        text = []
        for part in p['parts']:
            text += [part] if isinstance(part, dict) else runs(part)
        segments.append({'id': f'p{k}', 'kind': 'heading' if p['heading'] else 'paragraph', 'text': text, 'origin': ORIGIN, 'printed': p['boxes']})
    note_segs, seen = [], set()
    for n in notes:
        nid = note_id(n['label']) if n['label'] != '?' else f'nx{len(note_segs)}'
        if nid in seen:
            nid = f'{nid}-{len(note_segs)}'
        seen.add(nid)
        seg = {'id': nid, 'kind': 'note', 'text': [{'text': n['text']}], 'origin': ORIGIN, 'printed': n['boxes']}
        if n['label'].lstrip('*').isdigit():
            seg['n'] = int(n['label'].lstrip('*'))
            if n['label'].startswith('*'):
                seg['label'] = n['label']
        note_segs.append(seg)
    return {'profile': 'sichos-kodesh', 'versions': [{'id': 'he', 'language': 'he', 'segments': segments, 'notes': note_segs, 'origin': ORIGIN}]}


def plain(pt):
    """The page text as readable lines, for checking by eye: [n] a mark, {238} a page."""
    v = pt['versions'][0]
    show = lambda runs: ''.join(r.get('text') or (f"[{r['note'][1:].replace('s', '*')}]" if 'note' in r else f"{{{r['marker']}}}") for r in runs)
    return '\n\n'.join(('## ' if s['kind'] == 'heading' else '') + show(s['text']) for s in v['segments']) + '\n\n---\n' + '\n'.join(f"{n.get('label', n.get('n', '?'))}) {show(n['text'])}" for n in v['notes'])


if __name__ == '__main__':
    stem = sys.argv[1]  # e.g. 30_0001: ocr/<stem>_NN.json, printed pages from the start page on
    start = int(stem.split('_')[1])
    files = sorted(glob.glob(f'ocr/{stem}_[0-9][0-9].json'))
    pages = [(start + int(f[-7:-5]), int(f[-7:-5]) + 1, json.load(open(f))) for f in files]
    pt = assemble(pages)
    json.dump(pt, open(f'out/{stem}.json', 'w'), ensure_ascii=False)
    open(f'out/{stem}.txt', 'w').write(plain(pt))
    print(len(pt['versions'][0]['segments']), 'paragraphs', len(pt['versions'][0]['notes']), 'notes')
