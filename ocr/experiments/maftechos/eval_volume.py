"""
Scores a reader on a whole volume's subject index against the Chabad
Library's typed copy: topics found, page references right, missed, wrong.

    python3 eval_volume.py <scan.pdf> <typed.json> tesseract
    python3 eval_volume.py <scan.pdf> <typed.json> <kraken model>

Lines are found the same way for both readers (the Tesseract layout of
ocr_index), so the score compares only how each reads a line.
"""
import collections, difflib, html, json, re, sys
import numpy as np
import pymupdf
from PIL import Image
import ocr_index as o


def kraken_reader(model_path):
    from kraken.configs import RecognitionInferenceConfig
    from kraken.containers import BBoxLine, Segmentation
    from kraken.tasks import RecognitionTaskModel
    net = RecognitionTaskModel.load_model(model_path)
    config = RecognitionInferenceConfig(text_direction='horizontal-rl', num_line_workers=0)

    def read(col, lines):
        padded = np.pad(col, 40, constant_values=255)
        im = Image.fromarray(padded)

        def ink_box(l):
            # Tesseract's box sometimes leaves out a number at the line's start, so the
            # box spans all the ink in the line's band, kept tight as in training.
            y0, y1 = max(0, l['y'] - 6), min(padded.shape[0], l['y'] + l['h'] + 6)
            xs = np.where((padded[l['y']:l['y'] + l['h']] < 128).sum(0) > 0)[0]
            x0 = min(l['x_left'], xs.min()) if len(xs) else l['x_left']
            x1 = max(l['x_right'], xs.max() + 1) if len(xs) else l['x_right']
            return (max(0, x0 - 10), y0, min(padded.shape[1], x1 + 10), y1)
        boxes = [BBoxLine(id=str(i), bbox=ink_box(l),
                          text_direction='horizontal-rl') for i, l in enumerate(lines)]
        seg = Segmentation(type='bbox', imagename='page', text_direction='horizontal-rl', script_detection=False, lines=boxes)
        for l, rec in zip(lines, net.predict(im, seg, config)):
            l['text'] = with_volume_letter(rec.prediction.strip(), l['text'])
        return lines
    return read


def with_volume_letter(kraken, tesseract):
    """The bold volume letter that opens a line in the multi-volume indexes
    stands apart from the text, and Kraken, trained on single-volume indexes,
    sometimes leaves it out. Tesseract's line keeps it; take it from there."""
    kraken = re.sub(r'^([\u05d0-\u05ea]{1,2})(\d)', r'\1 \2', kraken.strip())
    m = re.match(r'\s*([\u05d0-\u05ea]{1,2}|\?)\s+\d', tesseract)
    if m and re.match(r'\d', kraken):
        kraken = m.group(1) + ' ' + kraken
    return with_brackets(kraken, tesseract)


def with_brackets(kraken, tesseract):
    """A page inside a note, where the note runs on ("[857]"), is printed in square
    brackets. The vol 30-33 lines had none, so Kraken reads [857] as נ857), (1857,
    8571) and the like, while Tesseract keeps the brackets (or at least the number)
    but misreads digits more often. Where Tesseract has the number, bracketed or
    not, and Kraken shows one of those marks round it, put brackets round Kraken's
    digits."""
    near = lambda a, b: len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 1
    bracketed = re.findall(r'\[(\d{1,4})\]', tesseract)
    plain = re.findall(r'(?<!\d)\d{1,4}(?!\d)', tesseract)
    mark = r'(?<!\d)(?P<open>נ|\(1|\[|1(?=\d{3}\)))?(?P<n>\d{2,4}?)(?P<close>1\)|\(\)|\]|\))'
    out, pos = [], 0
    for k in re.finditer(mark, kraken):
        n = k.group('n')
        odd = (k.group('open') or '') + k.group('close')
        is_bracket = any(near(n, t) for t in bracketed) or (odd not in (')',) and any(near(n, t) for t in plain) and not any(t == n + '1' for t in plain))
        if is_bracket and odd != ')' or (k.group('close') == ')' and k.group('open') and any(near(n, t) for t in bracketed)):
            # "(1860)" was "([860])" and "נ195()" was "[195])": keep the note's own bracket.
            fixed = '[' + n + ']'
            fixed = '(' + fixed + ')' if k.group('open') == '(1' else fixed + ')' if k.group('close') == '()' else fixed
            out.append(kraken[pos:k.start()] + fixed)
            pos = k.end()
    return ''.join(out) + kraken[pos:]


def ocr_volume(pdf, pages, read=None):
    columns = []
    for p in pages:
        a = o.deskew(o.render(pdf, p))
        top, bottom = o.body_bounds(a)
        gutter = o.split_columns(a, top, bottom)
        for col in ([a[top:bottom, gutter:], a[top:bottom, :gutter]] if gutter else [a[top:bottom]]):
            lines = o.ocr_column(col)
            while lines and lines[0]['y'] < 200 and (re.fullmatch(r'\W*\d{1,4}\W*', lines[0]['text']) or re.search(r'מפת[חת]|ענינים\s*/', lines[0]['text'])):
                lines.pop(0)
            columns.append(read(col, lines) if read else lines)
    return columns


norm = lambda t: re.sub(r'[\s"\'׳״,.:;()\-–—]', '', t or '')


def truth_topics(entries):
    T = collections.OrderedDict()
    for e in entries:
        text = html.unescape(e['text'] or '')
        text = text.split('page marker')[0]  # the library's page text sometimes ends in a stray timestamp
        text = re.sub(r'\[mafteach_gopage file="[^"]*" gopage="(\d+)[^"]*"\]', r'\1', text)
        text = re.sub(r'\[mafteach_goterm[^\]]*\]', '', text)
        refs = [int(m.group(1).split('-')[0]) for m in o.REF.finditer(text)]
        T.setdefault(norm(html.unescape(e['topic'])), {'topic': html.unescape(e['topic']).strip(), 'refs': []})['refs'] += refs
    return T


def score(T, parsed):
    O = collections.OrderedDict()
    for e in parsed:
        O.setdefault(norm(e['topic']), {'topic': e['topic'], 'refs': []})['refs'] += [r['page'] for r in e['refs']]
    okeys = list(O)
    stats = collections.Counter()
    diffs = []
    for k, t in T.items():
        if not t['refs']:
            continue
        stats['topics'] += 1
        stats['truth_refs'] += len(t['refs'])
        ok = k if k in O else next((x for x in okeys if x.endswith(k) and x != k), None)
        if ok is None and len(k) >= 4:
            ok = next(iter(difflib.get_close_matches(k, okeys, n=1, cutoff=0.8)), None)
        if ok is None:
            stats['topics_missing'] += 1
            diffs.append({'topic': t['topic'], 'missing_topic': True, 'want': t['refs']})
            stats['refs_in_missing_topics'] += len(t['refs'])
            continue
        want, got = collections.Counter(t['refs']), collections.Counter(O[ok]['refs'])
        stats['refs_right'] += sum((want & got).values())
        stats['refs_missed'] += sum((want - got).values())
        stats['refs_wrong'] += sum((got - want).values())
        if want != got:
            diffs.append({'topic': t['topic'], 'read_as': O[ok]['topic'], 'missed': sorted((want - got).elements()), 'extra': sorted((got - want).elements())})
    score.diffs = diffs
    return dict(stats)


if __name__ == '__main__':
    pdf_path, typed_path, reader = sys.argv[1:4]
    pdf = pymupdf.open(pdf_path)
    heads = [o.tesseract(o.render(pdf, p)[:420], ['-l', 'heb', '--psm', '6']) for p in range(len(pdf))]
    pages = [p for p, h in enumerate(heads) if re.search('ענ[י]?נים', h)]
    columns = ocr_volume(pdf, pages, None if reader == 'tesseract' else kraken_reader(reader))
    result = score(truth_topics(json.load(open(typed_path))), o.parse(columns, 1, 1))
    if len(sys.argv) > 4:  # keep what was read and every disagreement, for checking by hand
        json.dump({'lines': [[l['text'] for l in c] for c in columns], 'diffs': score.diffs}, open(sys.argv[4], 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({'reader': reader, 'pages': len(pages), **result}, ensure_ascii=False))
