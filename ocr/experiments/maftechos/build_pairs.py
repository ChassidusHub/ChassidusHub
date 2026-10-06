"""
Silver line pairs for training: each printed line of a scanned Likkutei
Sichos subject index, cut from the scan, with its text taken from the
Chabad Library's typed copy of the same index.

The typed copy is joined into one stream in print order (topic, then its
entries, with every page tag turned back into the printed number). Each
line the current OCR reads is located in that stream near where the last
line matched; the typed text of that stretch becomes the line's label.
A line is kept only when the OCR and the typed text nearly agree, since
where they differ one of the two is wrong (the typed copy has OCR errors
of its own). Kept lines are silver: they train, never test (plan §4.3).

    python3 build_pairs.py <scan.pdf> <typed.json> <out dir> [first page] [last page]
"""
import html, json, os, re, sys
import numpy as np
import pymupdf
from PIL import Image
from rapidfuzz import fuzz
import ocr_index as o

MIN_SCORE = 92  # rapidfuzz ratio between the OCR line and its typed stretch


def typed_stream(entries):
    parts = []
    for e in entries:
        text = html.unescape(e['text'] or '')

        def tag(m):
            a, _, b = m.group(1).partition('-')
            return a if not b else f'{a}-{b}'
        text = re.sub(r'\[mafteach_gopage file="[^"]*" gopage="([\d-]+)"\]', tag, text)
        text = re.sub(r'\[mafteach_goterm file="[^"]*" goterm="([^"]*)"\]', r'\1', text)
        text = re.sub(r'<[^>]+>', ' ', text)
        parts.append(html.unescape(e['topic']).strip() + ': ' + text)
    return re.sub(r'\s+', ' ', ' '.join(parts)).strip()


def page_lines(pdf, index):
    """Every OCR'd line of a page: its text and its crop."""
    a = o.deskew(o.render(pdf, index))
    top, bottom = o.body_bounds(a)
    gutter = o.split_columns(a, top, bottom)
    cols = [a[top:bottom, gutter:], a[top:bottom, :gutter]] if gutter else [a[top:bottom]]
    out = []
    for col in cols:
        padded = np.pad(col, 40, constant_values=255)
        for line in o.ocr_column(col):
            y0, y1 = line['y'] - 6, line['y'] + line.get('h', 60) + 6
            x0, x1 = line['x_left'] - 10, line['x_right'] + 10
            out.append({'text': line['text'], 'crop': padded[max(0, y0):y1, max(0, x0):x1]})
    return out


def align(lines, stream):
    """Locate each line in the stream near the last match; when that fails
    (the two copies order a few topics differently), look in the whole stream."""
    cursor, window = 0, 3000

    def best(text, start, end):
        m = fuzz.partial_ratio_alignment(text, stream[start:end], score_cutoff=60)
        if not m:
            return None
        s, e = start + m.dest_start, start + m.dest_end
        return s, e, fuzz.ratio(text, stream[s:e].strip())

    for line in lines:
        text = o.fix_ranges(re.sub(r'[|\u200f\u200e]', '', line['text'])).strip()
        if len(text) < 8:
            continue
        found = best(text, cursor, cursor + window)
        if (not found or found[2] < 85) and len(text) >= 20:
            wide = best(text, 0, len(stream))
            if wide and (not found or wide[2] > found[2] + 5):
                found = wide
        if not found:
            continue
        start, end, score = found
        yield line, text, stream[start:end].strip(), score
        if score >= 85:
            cursor = max(0, end - 20)


if __name__ == '__main__':
    pdf_path, typed_path, out = sys.argv[1:4]
    first = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    last = int(sys.argv[5]) if len(sys.argv) > 5 else None
    os.makedirs(out, exist_ok=True)
    pdf = pymupdf.open(pdf_path)
    stream = typed_stream(json.load(open(typed_path)))
    if len(sys.argv) > 4:
        pages = range(first, last + 1)
    else:
        # The subject index's pages: its running head says ענינים, and it opens under the title מפתח ענינים.
        heads = [o.tesseract(o.render(pdf, p)[:420], ['-l', 'heb', '--psm', '6']) for p in range(len(pdf))]
        pages = [p for p, h in enumerate(heads) if re.search('ענ[י]?נים', h)]
    print('pages', list(pages))
    lines = []
    for p in pages:
        lines += page_lines(pdf, p)
    kept = total = 0
    report = []
    for i, (line, text, typed, score) in enumerate(align(lines, stream)):
        total += 1
        report.append({'n': i, 'score': round(score, 1), 'ocr': text, 'typed': typed})
        if score >= MIN_SCORE:
            Image.fromarray(line['crop']).save(f'{out}/{i:05d}.png')
            open(f'{out}/{i:05d}.gt.txt', 'w').write(typed + '\n')
            kept += 1
    json.dump(report, open(f'{out}/report.json', 'w'), ensure_ascii=False, indent=0)
    print(f'{kept} of {total} lines kept ({len(lines)} read)')
