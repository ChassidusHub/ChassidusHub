"""
OCR for the scanned Likkutei Sichos subject indexes (מפתח ענינים).

A page is two columns, read right column first. Each column holds topics
("גאולה:") and under each topic lines like
    א 35 (בזמנה לא תתמהמה...). 44 (התחילה בקניית מערת המכפלה).
where the bold letter is the volume (א-ט in the first book) and each number
is a page, followed by a short note in brackets. Continuation lines carry
more page (note) pairs for the same volume.

Tesseract's Hebrew model reads the words well but drops digits of a number
that starts a line (125 comes out as 5). So every stretch of ink that no
word box covers, and every number it did read, is read again with a
digits-only pass, and the line is rebuilt right to left.
"""
import csv, io, json, re, subprocess, sys
import numpy as np
import pymupdf
from PIL import Image

TESSDATA = __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'tessbest')
HEB_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'


def render(pdf, index, dpi=300):
    pix = pdf[index].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width).copy()


def deskew(a):
    """Scans lean a little; turn the page so its lines are level (the angle whose rows are sharpest)."""
    small = Image.fromarray(a).resize((a.shape[1] // 4, a.shape[0] // 4))
    best = (0, 0.0)
    for tenth in range(-20, 21, 2):
        r = np.array(small.rotate(tenth / 10, fillcolor=255)) < 128
        score = np.var(r.sum(1))
        if score > best[0]:
            best = (score, tenth / 10)
    if best[1] == 0:
        return a
    return np.array(Image.fromarray(a).rotate(best[1], fillcolor=255, resample=Image.BICUBIC))


def body_bounds(a):
    """Rows between the header rule and the footer rule (the Otzar HaChochma stamp), when the page has them."""
    ink = (a < 128).sum(1)
    h, w = a.shape
    rules = np.where(ink > w * 0.5)[0]
    top = max([r for r in rules if r < h * 0.15], default=0) + 20
    bottom = min([r for r in rules if r > h * 0.85], default=h) - 10
    return top, bottom


def split_columns(a, top, bottom):
    """The emptiest band near the middle; None when the page is one column."""
    ink = (a[top:bottom] < 128).sum(0).astype(float)
    ink = np.convolve(ink, np.ones(7) / 7, mode='same')
    w = a.shape[1]
    lo, hi = int(w * 0.35), int(w * 0.65)
    # Cut in the middle of the widest empty band. The left column's volume letters
    # stand in a narrow strip of their own beside the gutter; cutting at the first
    # empty spot put them in the right column, and the left column lost them.
    empty = ink[lo:hi] <= 0.01 * (bottom - top)
    runs, start = [], None
    for i, e in enumerate(list(empty) + [False]):
        if e and start is None:
            start = i
        elif not e and start is not None:
            runs.append((start, i))
            start = None
    if not runs:
        return None
    s, e = max(runs, key=lambda r: r[1] - r[0])
    return lo + (s + e) // 2


def tesseract(img, args):
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format='PNG')
    out = subprocess.run(['tesseract', 'stdin', 'stdout', '--tessdata-dir', TESSDATA] + args, input=buf.getvalue(), capture_output=True)
    return out.stdout.decode('utf-8')


def read_digits(img):
    """The page numbers in a crop, as text ("283 298"). Read three ways - at the
    size scanned, at twice the size, and by the Hebrew model - and the reading
    two of them agree on wins; otherwise the one at the size scanned. (A bold 75
    reads as 718 at one size, and a first digit is lost at the other.)"""
    def eng(im):
        text = tesseract(im, ['-l', 'eng', '--psm', '7', '-c', 'tessedit_char_whitelist=0123456789-(). '])
        # Brackets and full stops are allowed so they are not read as digits; they split numbers.
        return ' '.join(re.findall(r'\d[\d-]*\d|\d', text))
    padded = np.pad(img, 10, constant_values=255)
    big = np.array(Image.fromarray(padded).resize((padded.shape[1] * 2, padded.shape[0] * 2), Image.LANCZOS))
    heb = ' '.join(re.findall(r'\d[\d-]*\d|\d', tesseract(padded, ['-l', 'heb', '--psm', '7'])))
    reads = [eng(img), eng(big), heb]
    for r in reads[:2]:
        if r and reads.count(r) >= 2:
            return r
    return reads[0] or reads[1]


def ocr_column(col):
    col = np.pad(col, 40, constant_values=255)
    tsv = tesseract(col, ['-l', 'heb', '--psm', '4', '-c', 'tessedit_create_tsv=1', '-c', 'tessedit_create_txt=0'])
    rows = list(csv.reader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE))[1:]
    lines = {}
    for r in rows:
        if len(r) < 12 or r[0] != '5' or not r[11].strip():
            continue
        key = (int(r[2]), int(r[3]), int(r[4]))
        x, y, w, h = map(int, r[6:10])
        lines.setdefault(key, []).append({'x': x, 'y': y, 'w': w, 'h': h, 'text': r[11]})
    out = []
    for words in lines.values():
        y0 = min(t['y'] for t in words)
        y1 = max(t['y'] + t['h'] for t in words)
        strip = col[y0:y1] < 128
        covered = np.zeros(col.shape[1], bool)
        for t in words:
            if re.fullmatch(r'[\d\-]+[.,]?', t['text']):
                continue  # numbers are re-read below, with whatever ink sits beside them
            covered[max(0, t['x'] - 4): t['x'] + t['w'] + 4] = True
        ink = strip.sum(0) > 0
        # Uncovered ink, grouped into spans; digits of one number sit a few pixels apart.
        xs = np.where(ink & ~covered)[0]
        spans = []
        for x in xs:
            if spans and x - spans[-1][1] <= 14:
                spans[-1][1] = x + 1
            else:
                spans.append([x, x + 1])
        spans = [(s, e) for s, e in spans if e - s >= 12]
        tokens = [t for t in words if not re.fullmatch(r'[\d\-]+[.,]?', t['text'])]
        for s, e in spans:
            crop = col[y0 - 4:y1 + 4, max(0, s - 6):e + 6]
            digits = read_digits(crop)
            if re.search(r'\d', digits):
                tokens.append({'x': s, 'w': e - s, 'text': digits})
            else:
                # The bold volume letter at the start of a line is also sometimes dropped.
                letter = tesseract(np.pad(crop, 20, constant_values=255), ['-l', 'heb', '--psm', '10']).strip()
                if re.fullmatch(f'[{HEB_LETTERS}]{{1,2}}', letter):
                    tokens.append({'x': s, 'w': e - s, 'text': letter})
                elif e - s <= 45 and s > max(t['x'] + t['w'] for t in words):
                    tokens.append({'x': s, 'w': e - s, 'text': '?'})  # a volume letter that would not read
        tokens.sort(key=lambda t: -t['x'])  # right to left
        out.append({'y': y0, 'h': y1 - y0, 'x_left': min(t['x'] for t in words), 'x_right': max(t['x'] + t['w'] for t in words), 'width': max(t['x'] + t['w'] for t in words) - min(t['x'] for t in words), 'column': col.shape[1] - 80, 'text': ' '.join(t['text'] for t in tokens)})
    out.sort(key=lambda l: l['y'])
    return out


def ocr_page(pdf, index):
    a = deskew(render(pdf, index))
    top, bottom = body_bounds(a)
    gutter = split_columns(a, top, bottom)
    cols = [a[top:bottom, gutter:], a[top:bottom, :gutter]] if gutter else [a[top:bottom]]
    out = []
    for c in cols:
        lines = ocr_column(c)
        # Pages without a header rule keep the running head: the page number and "מפתח ענינים / from-to".
        while lines and lines[0]['y'] < 200 and (re.fullmatch(r'\W*\d{1,4}\W*', lines[0]['text']) or re.search(r'מפת[חת]|ענינים\s*/', lines[0]['text'])):
            lines.pop(0)
        out.append(lines)
    return out


CONFUSABLE = {'ו': 'ז', 'ז': 'ו', 'ה': 'ח', 'ח': 'ה', 'ד': 'ר', 'ב': 'כ', 'כ': 'ב', 'ט': 'ש'}
VOLUME = re.compile(rf'^([{HEB_LETTERS}]{{1,3}}|\?)\s+(?=\d)')
REF = re.compile(r'(\d+(?:-\d+)?)\s*(\((?:[^()]|\([^()]*\))*\)\.?)?')


def hebrew_numeral(n):
    ones, tens = ' אבגדהוזחט', ' יכלמנסעפצ'
    return {15: 'טו', 16: 'טז'}.get(n) or (tens[n // 10].strip() + ones[n % 10].strip())


def fix_ranges(line):
    """A page range's raised hyphen reads as a 7 and the second page is often
    shortened: 122⁻23 comes out 122723, and 236⁻235 (printed right to
    left) comes out 2367235. Split at the
    7 that leaves a following page one to five pages on."""
    def split(m):
        s = m.group(0)
        for i in range(2, len(s) - 1):
            if s[i] != '7':
                continue
            a, b = s[:i], s[i + 1:]
            if len(b) < 2 or len(b) > len(a) or b.startswith('0'):
                continue
            full = int(a[:len(a) - len(b)] + b)
            if 0 < abs(full - int(a)) <= 5:
                return f'{min(int(a), full)}-{max(int(a), full)}'
        if len(s) in (6, 8) and 0 < abs(int(s[:len(s) // 2]) - int(s[len(s) // 2:])) <= 5:
            a, b = sorted((int(s[:len(s) // 2]), int(s[len(s) // 2:])))
            return f'{a}-{b}'  # the hyphen was lost altogether
        return s
    return re.sub(r'\d{4,9}', split, line)


def parse(columns, first=1, last=9):
    """Topics and their references: [{topic, refs: [{volume, page, to, note}]}]. Text before the first topic continues the page before."""
    volumes = [hebrew_numeral(n) for n in range(first, last + 1)]
    entries, segment = [], None
    flat = [l for col in columns for l in col]
    for i, l in enumerate(flat):
        if True:
            nxt = flat[i + 1]['text'].strip() if i + 1 < len(flat) else ''
            line = fix_ranges(re.sub(r'[|\u200f\u200e]', '', l['text'])).strip()
            line = re.sub(r'^[^\w(?]+', '', line)
            if not line:
                continue
            # A heading is a short line of its own; its colon is sometimes lost.
            # Page footers print the page's first and last topic and its number glued on
            # ("עסק ... תורה355"); they have no parentheses, which every entry's note has.
            # A misread digit can put a letter among its digits ("חכמה9ג5").
            if re.fullmatch(r'(?=.*[\u05d0-\u05ea]{3})[^\d():]{3,60}\d[\d\u05d0-\u05ea]{0,3}', line) and not line.startswith('ע"ע'):
                continue
            # A heading is a short line of its own; its colon is sometimes lost.
            short_heading = (not re.search(r'[\d()]', line) and not line.startswith('ע"ע') and re.match(r'\d', nxt)
                             and (len(line.split()) <= 2 or (l.get('width', 999) < 0.5 * l.get('column', 1) and len(line.split()) <= 4)))
            # A heading may carry a short gloss in parentheses: כפר חב"ד (ישוב):
            # Inside an open note a line can end in a colon too ("ג' עניני':"); it is not a heading.
            in_note = segment is not None and segment['text'].count('(') > segment['text'].count(')')
            if not in_note and (re.fullmatch(r'\(?[^\d()]{2,40}\)?(\s*\([^\d()]{1,20}\))?\s*:', line) or short_heading):
                entries.append({'topic': line.rstrip(': ').strip(), 'segments': []})
                segment = None
                continue
            if not entries:
                entries.append({'topic': None, 'segments': []})
            m = VOLUME.match(line)
            token = m and (m.group(1) if m.group(1) in volumes else m.group(1)[-1])
            guessed = False
            if m and token == '?':
                # Unreadable: take the volume after the last one under this topic.
                last = next((s['volume'] for s in reversed(entries[-1]['segments']) if s['volume']), None)
                token, guessed = (volumes[volumes.index(last) + 1] if last and last != volumes[-1] else volumes[0]), True
            if m and token in volumes:
                # A stray mark of the page stamp can join the letter (אב for ב).
                # Volumes run in order under a topic; a bold ז often reads as ו.
                last = next((s['volume'] for s in reversed(entries[-1]['segments']) if s['volume']), None)
                if last and volumes.index(token) <= volumes.index(last):
                    token = next((c for c in CONFUSABLE.get(token, '') if c in volumes and volumes.index(c) > volumes.index(last)), token)
                segment = {'volume': token, 'text': line[m.end():], 'guessed': guessed}
                entries[-1]['segments'].append(segment)
            elif segment is None:
                segment = {'volume': None, 'text': line}
                entries[-1]['segments'].append(segment)
            else:
                segment['text'] += ' ' + line
    out = []
    for e in entries:
        refs = []
        for seg in e['segments']:
            for r in REF.finditer(seg['text']):
                a, _, b = r.group(1).partition('-')
                start, end = (min(int(a), int(b)), max(int(a), int(b))) if b else (int(a), int(a))
                note = re.sub(r'^\(|\)\.?$', '', (r.group(2) or '').strip())
                refs.append({'volume': seg['volume'], 'check': seg.get('guessed', False), 'page': start, 'to': end, 'note': re.sub(r'\s+', ' ', note)})
        out.append({'topic': e['topic'], 'refs': refs})
    return out

if __name__ == '__main__':
    pdf = pymupdf.open(sys.argv[1])
    pages = [int(p) for p in sys.argv[2:]]
    result = []
    for p in pages:
        cols = ocr_page(pdf, p)
        result.append({'pdf_page': p + 1, 'lines': [[l['text'] for l in c] for c in cols], 'entries': parse(cols)})
    json.dump(result, sys.stdout, ensure_ascii=False, indent=1)
