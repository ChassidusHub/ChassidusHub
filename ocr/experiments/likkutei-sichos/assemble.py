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
# A mark stands right after a word's last letter or quote, never after a digit:
# "הערה 29)" is a reference to another note, not the word "2" and the mark 9.
MARK = re.compile(r'(?<=[^\s\d])(\*{1,3}\d{0,3}|\d{1,3})\)')
NOTE_START = re.compile(r'^(\*{1,3}\d{0,3}|\d{1,3})\)\s*')
# An ois: a paragraph opening with its letter and a period, א. ב. … יא.
OIS = re.compile(r'^([א-ת]{1,2})\.\s')
LETTERS = dict(zip('אבגדהוזחטיכלמנסעפצקרשת', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400]))


def note_id(label):
    return 'n' + label.replace('*', 's')


def edges(lines):
    xs1 = sorted(l['x1'] for l in lines)
    xs0 = sorted(l['x0'] for l in lines)
    return xs0[len(xs0) // 10] if xs0 else 0, xs1[len(xs1) * 9 // 10] if xs1 else 0


FACE_ON, FACE_OFF = '\ue000', '\ue001'  # around letters set in Miram (recog.faces), until runs() turns them into a mark


def runs(text):
    """Words with footnote marks as links, and the stretches set in Miram (the
    light face, which is this print's stress, what bold is elsewhere; Shmuly
    2026-10-02) carrying the mark 'b'."""
    out = []
    # Two Miram words with only a space between them are one bold stretch, as in
    # print; so are the two halves of a word the print broke over a line (ה־ + בהמית).
    text = re.sub(f'{FACE_OFF}( *){FACE_ON}', r'\1', text)
    # A single letter judged Miram at the head of a word whose other letters are
    # Frank is noise, not a face (the כ of כראוי, broken over a line as „כ־ + ראוי):
    # the real pattern is the reverse, a Frank prefix on a Miram word (הבהמית).
    text = re.sub(f'(?<![א-ת]){FACE_ON}([א-ת]){FACE_OFF}(?=[א-ת])', r'\1', text)
    # A closing quote or apostrophe glued to a Miram word is set with it (בו ית'; Shmuly
    # 2026-10-02); the opening „ before a word is not.
    text = re.sub(f'{FACE_OFF}(["\'\u05f3\u05f4]+)', r'\1' + FACE_OFF, text)
    for k, piece in enumerate(re.split(f'[{FACE_ON}{FACE_OFF}]', text)):
        marks = ['b'] if k % 2 else None
        pos = 0
        for m in MARK.finditer(piece):
            if m.start() > pos:
                out.append({'text': piece[pos:m.start()], **({'marks': marks} if marks else {})})
            out.append({'note': note_id(m.group(1))})
            pos = m.end()
        if pos < len(piece):
            out.append({'text': piece[pos:], **({'marks': marks} if marks else {})})
    return out


def unfaced(text):
    return text.replace(FACE_ON, '').replace(FACE_OFF, '')


VOCAB = None  # word counts from the library (lm/vocab_big.txt), when given
COMPOUNDS = set()  # compounds the library writes with a makaf (lm/compounds.txt): the only ones kept at a line end


def known(w):
    w = re.sub(r'^[^א-ת]+|[^א-ת]+$', '', w)
    return bool(VOCAB) and VOCAB.get(w, 0) >= 3


def join(a, b):
    """Two printed lines as one run of words. A line ending in a makaf is either a
    word the print broke (להבר־ + אות), joined again, or a compound whose makaf
    stays (תומכי־ + תמימים); the two look alike, so the library's vocabulary
    decides: joined when the joined word is a known word, else kept with its makaf."""
    if not a:
        return b
    if a.endswith(('-', '־')):
        head, first = a[:-1], b.split(' ', 1)[0]
        last = head.split(' ')[-1]
        # On vol 39, 932 of 933 line-end makafs were broken words, so the makaf
        # stays only for a compound the library itself writes with one.
        strip = lambda w: re.sub(r'^[^א-ת]+|[^א-ת"\']+$', '', w)
        if first.startswith('־'):  # the print carries the makaf over: בשבת־ / ־קודש
            return head + b
        if strip(last) + '־' + strip(first) in COMPOUNDS:
            return a + b
        return head + b
    return a + ' ' + b


def fix_dots(text):
    """The print's omission mark ". ." stands apart from the word before it
    (ביין . . אבל); the reader glues the first dot to the word."""
    return re.sub(r'(?<=[א-ת\'"\u05f3\u05f4\ue001])\. \.', ' . .', text)


# A star the ink stage (recog.stars) put inside a word: שלמ*) ים. The stage inserts
# "*) " before the first letter left of the blob, so a blob over a word's middle
# (a speck, a serif) splits it. Dropped when the halves cannot be two words.
STAR_SPLIT = re.compile(r'([א-ת][א-ת"\'\ue000\ue001]*)(\*{1,3})\) ([\ue000\ue001]*[א-ת]+)')


def unsplit_stars(text):
    def fix(m):
        left, right = unfaced(m.group(1)), unfaced(m.group(3))
        # a word cannot begin with a final letter nor end with a letter that has a
        # final form; else the library's vocabulary decides (שלמ + ים = שלמים)
        if right[0] in 'ךםןףץ' or left[-1] in 'כמנפצ' or (not known(left) and known(left + right)):
            return m.group(1) + m.group(3)
        return m.group(0)
    return STAR_SPLIT.sub(fix, text)


def flip_faces(text):
    """A second-level note is set in Miram, its stressed words in Frank, so the
    marks flip: a stretch the face stage left in Frank carries the mark 'b', a
    Miram one none (Shmuly 2026-10-02: in such a note the Frank words are the
    stressed ones, and the Miram face itself need not be marked). Only stretches
    with letters flip; a bracket or a comma between them is set alike in both."""
    out = []
    for k, piece in enumerate(re.split(f'[{FACE_ON}{FACE_OFF}]', text)):
        if k % 2 == 0 and re.search('[א-ת]', piece):
            m = re.match(r'^([^א-ת]*)(.*[א-ת])([^א-ת"\'\u05f3\u05f4]*)$', piece, re.S)
            out.append(m.group(1) + FACE_ON + m.group(2) + FACE_OFF + m.group(3))
        else:
            out.append(piece)
    return ''.join(out)


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
        for line in lay.get('headings', []):  # a sicha's heading, set across the page
            text = line.get('text', '').strip()
            if not text:
                continue
            cur = {'parts': [], 'boxes': [], 'heading': True, 'date': False}
            paras.append(cur)
            if first_on_page:
                cur['parts'].append({'marker': str(printed)}); first_on_page = False
            cur['parts'].append(text); merge_box(cur['boxes'], box(line, shape, pdf_page)); line['_in'] = cur
            cur = None  # the body after it starts a paragraph of its own
        for col in lay['body']:
            if not col:
                continue
            left, right = edges(col)
            prev_short = False
            for i, line in enumerate(col):
                text = fix_dots(line.get('text', '').strip())
                if not text:
                    continue
                indented = line['x1'] < right - 25
                short = line['x0'] > left + 40
                if cur is None or indented or (i > 0 and prev_short):
                    cur = {'parts': [], 'boxes': [], 'heading': indented and short and len(unfaced(text)) < 40,
                           'date': indented and bool(re.fullmatch(r'\(.{3,60}\)', unfaced(text)))}  # (משיחת ש"פ תשא תשמ"ט), set at the column's far end
                    paras.append(cur)
                    if cur['date']:
                        cur['heading'] = False
                if first_on_page:
                    cur['parts'].append({'marker': str(printed)})
                    first_on_page = False
                if cur['parts'] and isinstance(cur['parts'][-1], str):
                    cur['parts'][-1] = join(cur['parts'][-1], text)
                else:
                    cur['parts'].append(text)
                merge_box(cur['boxes'], box(line, shape, pdf_page))
                line['_in'] = cur
                prev_short = short
        for col in lay['notes']:
            for line in col:
                text = fix_dots(line.get('text', '').strip())
                if not text:
                    continue
                m = NOTE_START.match(text)
                lost = None
                if not m and note is not None and text.startswith(')') and note['label'].isdigit():
                    # The reader lost the number of a note's opening "3)" and kept the
                    # bracket: a line opening with ")" after note k is note k+1, not
                    # more of note k (page 62 of vol 33 lost three this way).
                    lost = str(int(note['label']) + 1)
                    text = text[1:].lstrip()
                if m or lost or note is None:
                    label = m.group(1) if m else lost or '?'
                    # Three levels of notes: numbered (set in Frank; *14 is a note added
                    # later under an existing number, still the first level), stars alone
                    # *, **, *** (called from inside a note; set in Miram, stressed words
                    # in Frank), and, very rarely, a third in Hadassah.
                    note = {'label': label, 'level': 2 if label.strip('*') == '' and label != '?' else 1, 'text': text[m.end():] if m else text, 'boxes': []}
                    notes.append(note)
                else:
                    note['text'] = join(note['text'], text)
                merge_box(note['boxes'], box(line, shape, pdf_page))
                line['_in'] = note
    for p in paras:
        p['parts'] = [unsplit_stars(part) if isinstance(part, str) else part for part in p['parts']]
    for n in notes:
        n['text'] = unsplit_stars(n['text'])
    # Each ois is a section: the paragraph that opens with its letter, and the paragraphs
    # after it up to the next ois. What comes before the first stays outside any.
    segments, section = [], None
    for k, p in enumerate(paras, 1):
        text = []
        for part in p['parts']:
            text += [part] if isinstance(part, dict) else runs(part)
        if p.get('date'):
            # A date-said line (the sicha's ending, "(משיחת ... תש"מ)") is set small in Miram;
            # it is its own kind of line, not stressed text, so it is marked small, never bold
            # (Shmuly 2026-10-02).
            merged = []
            for r in text:
                if 'text' in r and merged and 'text' in merged[-1]:
                    merged[-1] = {'text': merged[-1]['text'] + r['text'], 'marks': ['small']}
                else:
                    merged.append({**r, 'marks': ['small']} if 'text' in r else r)
            text = merged
        seg = {'id': f'p{k}', 'kind': 'date' if p.get('date') else 'heading' if p['heading'] else 'paragraph', 'text': text, 'origin': ORIGIN, 'printed': p['boxes']}
        p['id'] = seg['id']
        first = next((r['text'] for r in text if 'text' in r), '')
        m = OIS.match(unfaced(first))
        if m and all(c in LETTERS for c in m.group(1)):
            seg['kind'] = 'paragraph'  # a short opening line, not a heading
            # The ois letter itself carries its formatting (Shmuly 2026-10-02): its own
            # run with the mark 'ois', never 'b', so a site can draw it apart from
            # Miram (this print's bold).
            k0 = next(i for i, r in enumerate(text) if 'text' in r)
            head, rest = text[k0]['text'][:m.end()].rstrip(), text[k0]['text'][m.end():]
            text[k0:k0 + 1] = [{'text': head, 'marks': ['ois']}] + ([{'text': ' ' + rest, **({'marks': text[k0]['marks']} if text[k0].get('marks') else {})}] if rest else [])
            n = sum(LETTERS[c] for c in m.group(1))
            section = {'id': f'ois{n}' if not any(x['id'] == f'ois{n}' for x in segments) else f'ois{n}-{k}',
                       'kind': 'section', 'n': n, 'label': m.group(1), 'origin': ORIGIN, 'children': []}
            segments.append(section)
        elif p['heading']:
            section = None  # a heading (a new sicha's title) closes the ois before it
        elif p.get('date'):
            section = None  # a date-said line ends the sicha's part before it
        (section['children'] if section else segments).append(seg)
    # A note printed with a bare star "*)" whose mark in the text carries a number
    # too ("*33)", a note added later under 33): the note takes the mark's label,
    # found by order: the mark with the same stars between its neighbours' numbers.
    marks_in_order = [m.group(1) for p in paras for part in p['parts'] if isinstance(part, str) for m in MARK.finditer(part)]
    for i, n in enumerate(notes):
        if n['label'].strip('*') or not n['label'].startswith('*'):
            continue
        prev_n = next((int(x['label'].lstrip('*')) for x in reversed(notes[:i]) if x['label'].lstrip('*').isdigit()), 0)
        next_n = next((int(x['label'].lstrip('*')) for x in notes[i + 1:] if x['label'].lstrip('*').isdigit()), 10 ** 6)
        taken = {x['label'] for x in notes}
        for m in marks_in_order:
            if m.startswith(n['label']) and m[len(n['label']):].isdigit() and prev_n <= int(m[len(n['label']):]) <= next_n and m not in taken:
                n['label'] = m
                break
    # A note's level and where it is called from, by the page's structure: a note
    # with a bare-star label (*, **, read from the ink of the star, recog.stars) whose
    # mark stands inside another note is the second level, wherever it is printed;
    # a star note called from the title or the body, and every numbered note (even
    # one printed with a star, *14), is the first level.
    # Every mark in reading order (headings and body first, then the notes), so
    # that two star notes on one page each get their own mark: the i-th bare-star
    # note with a label is called from the i-th mark with that label.
    calls = []
    for p in paras:
        for part in p['parts']:
            if isinstance(part, str):
                calls += [(m.group(1), 'heading' if p['heading'] else 'body') for m in MARK.finditer(unfaced(part))]
    for n in notes:
        calls += [(m.group(1), 'note') for m in MARK.finditer(unfaced(n['text']))]
    used = {}
    for n in notes:
        k = used.get(n['label'], 0)
        hits = [c for c in calls if c[0] == n['label']]
        n['called_from'] = hits[k][1] if k < len(hits) else (hits[-1][1] if hits else None)
        used[n['label']] = k + 1
    note_segs, seen = [], set()
    for n in notes:
        nid = note_id(n['label']) if n['label'] != '?' else f'nx{len(note_segs)}'
        if nid in seen:
            nid = f'{nid}-{len(note_segs)}'
        seen.add(nid)
        n['id'] = nid
        # Second level only when a bare-star note is called from inside another note
        # (Shmuly 2026-10-02): a star note on the sicha's title or body is the first level.
        n['level'] = 2 if n['label'] != '?' and n['label'].strip('*') == '' and n['called_from'] == 'note' else 1
        # a second-level note is set in Miram; its Frank words are the stressed ones
        text = flip_faces(n['text']) if n['level'] == 2 else n['text']
        seg = {'id': nid, 'kind': 'note', 'level': n['level'], 'text': runs(text), 'origin': ORIGIN, 'printed': n['boxes']}
        if n['label'].lstrip('*').isdigit():
            seg['n'] = int(n['label'].lstrip('*'))
        if n['label'].startswith('*'):
            seg['label'] = n['label']
        note_segs.append(seg)
    # Every bare-star mark reads "*)" alike, so runs() linked each to the id of the
    # first star note; the k-th such mark on the sicha, headings and body first,
    # then the notes, is the k-th star note with those stars (as called_from above).
    star_ids, used = {}, {}
    for seg in note_segs:
        if seg.get('label') and seg['label'].strip('*') == '':
            star_ids.setdefault(seg['label'], []).append(seg['id'])
    def rebind(text):
        for r in text:
            label = r.get('note', '')[1:].replace('s', '*') if 'note' in r else ''
            if label and label.strip('*') == '' and label in star_ids:
                k = used.get(label, 0)
                r['note'] = star_ids[label][min(k, len(star_ids[label]) - 1)]
                used[label] = k + 1
    def walk(segs):
        for seg in segs:
            if seg['kind'] == 'section':
                walk(seg['children'])
            else:
                rebind(seg['text'])
    walk(segments)
    for seg in note_segs:
        rebind(seg['text'])
    return pt_with_layout({'profile': 'sichos-kodesh', 'versions': [{'id': 'he', 'language': 'he', 'segments': segments, 'notes': note_segs, 'origin': ORIGIN}]}, pages)


def head_parts(head):
    """The running head's parts by their place: the page number at the outer edge,
    the set's title (לקוטי שיחות) and, between its two words, the sicha's name."""
    words = sorted(head.get('words', []), key=lambda x: -x['x0'])  # right to left
    number = next((int(x['text']) for x in words if x['text'].isdigit()), None)
    title = [x for x in words if x['text'] in ('לקוטי', 'שיחות', 'לקוטישיחות')]
    sicha = [x['text'] for x in words if not x['text'].isdigit() and x not in title
             and (len(title) < 2 or title[1]['x0'] < x['x0'] < title[0]['x0'])]
    return {'page_number': number, 'head_title': ' '.join(x['text'] for x in title), 'head_sicha': ' '.join(sicha)}


def pt_with_layout(pt, pages):
    """The page text, and beside it where everything is on the scans: each page's
    printed number and size, its running head, and every line (body or note, its
    column, its box) with the paragraph or note it belongs to and each word's place
    and the model's confidence. Boxes are fractions of the page, as in pageText.ts."""
    layout = []
    for printed, pdf_page, lay in pages:
        h, w = lay['shape']
        fx = lambda x: round(x / w, 4)
        page = {'pdf_page': pdf_page, 'printed_page': printed, 'size': [w, h], 'head_text': lay['head'].get('text', ''), **head_parts(lay['head']),
                'head': [fx(lay['head']['x0']), round(lay['head']['y0'] / h, 4), fx(lay['head']['x1'] - lay['head']['x0']), round((lay['head']['y1'] - lay['head']['y0']) / h, 4)], 'lines': []}
        for kind in ('headings', 'body', 'notes'):
            for c, col in enumerate([lay.get('headings', [])] if kind == 'headings' else lay[kind]):
                for line in col:
                    page['lines'].append({'kind': 'note' if kind == 'notes' else 'heading' if kind == 'headings' else 'body', 'column': c, 'text': unfaced(line.get('text', '')),
                                          'box': box(line, (h, w), pdf_page)['box'], 'in': line.get('_in', {}).get('id'),
                                          'marks': [{'label': x['label'], 'x0': fx(x['x0']), 'x1': fx(x['x1'])} for x in line.get('marks', [])],
                                          'words': [{'text': x['text'], 'x0': fx(x['x0']), 'x1': fx(x['x1']), 'conf': x['conf'], **({'face': x['face']} if x.get('face') else {})} for x in line.get('words', [])]})
        # the notes that open on this page: their level and where each is called from
        starts = {}
        for col in lay['notes']:
            for line in col:
                n = line.get('_in')
                if n and 'label' in n and n['id'] not in starts:
                    starts[n['id']] = n
        page['notes'] = [{'id': n['id'], 'label': n['label'], 'level': n['level'], 'called_from': n.get('called_from')} for n in starts.values()]
        layout.append(page)
    return pt, layout


def plain(pt):
    """The page text as readable lines, for checking by eye: [n] a mark, {238} a page."""
    v = pt['versions'][0]
    show = lambda runs: ''.join((f"⟪{r['text']}⟫" if 'small' in (r.get('marks') or []) else f"⦃{r['text']}⦄" if 'ois' in (r.get('marks') or []) else f"⟨{r['text']}⟩" if r.get('marks') else r['text']) if 'text' in r else (f"[{r['note'][1:].replace('s', '*')}]" if 'note' in r else f"{{{r['marker']}}}") for r in runs)
    def lines(segs):
        for s in segs:
            if s['kind'] == 'section':
                yield f"### אות {s['label']}"
                yield from lines(s['children'])
            else:
                yield ('## ' if s['kind'] == 'heading' else '') + show(s['text'])
    return '\n\n'.join(lines(v['segments'])) + '\n\n---\n' + '\n'.join(f"{n.get('label', n.get('n', '?'))}){' [level 2]' if n.get('level') == 2 else ''} {show(n['text'])}" for n in v['notes'])


if __name__ == '__main__':
    stem = sys.argv[1]  # e.g. 30_0001: ocr/<stem>_NN.json, printed pages from the start page on
    start = int(stem.split('_')[1])
    files = sorted(glob.glob(f'ocr/{stem}_[0-9][0-9].json'))
    pages = [(start + int(f[-7:-5]), int(f[-7:-5]) + 1, json.load(open(f))) for f in files]
    pt, layout = assemble(pages)
    json.dump(pt, open(f'out/{stem}.json', 'w'), ensure_ascii=False)
    json.dump({'volume': int(stem.split('_')[0]), 'first_page': start, 'model': ORIGIN['by'], 'pages': layout}, open(f'out/{stem}.layout.json', 'w'), ensure_ascii=False)
    open(f'out/{stem}.txt', 'w').write(plain(pt))
    print(len(pt['versions'][0]['segments']), 'paragraphs', len(pt['versions'][0]['notes']), 'notes')
