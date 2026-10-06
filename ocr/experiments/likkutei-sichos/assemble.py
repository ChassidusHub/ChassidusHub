"""A sicha's read lines put back together as ChassidusHub page text
(packages/model/src/pageText.ts): paragraphs, not printed lines; each
footnote mark a link to its note; the printed page numbers kept as
markers where each page begins; every paragraph's place on the scan kept
so a checker can see it there. All of it machine-made, and labelled so.

A paragraph starts where a line is indented, or after a line that stops
short; a word broken at a line end with - is joined again. A note starts
at a line opening with its number, N) or *N); a line without one goes on
the note before it, even over a column or a page."""
import glob, json, re, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from postfix import tidy  # reads made before the rules after reading went into recog get them here
import pointing

# Yiddish words the reader reads bare get the print's point (pointing.py) in the
# volumes that point them: on Shmuly's alef sheet (2026-10-05) 223 of 250 such
# words in vols 15-25 had the point in the scan. Not vol 39, whose Igros print
# א bare. readsicha.py sets it by volume.
POINT_YIDDISH = False


def pointed(text):
    return pointing.fix(text) if POINT_YIDDISH and pointing.YID.search(text) else text

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


# Every printed line end is kept (Shmuly 2026-10-02: "so if we want to make a revised
# version of the print it will be very simple"), as ChassidusHub's run {eol, split, page,
# box}: which end it is (line, column, page), whether the print broke a word there,
# and the line's place on the scan. While lines are joined into paragraphs a line end
# is a token in the text, EOL_ON + its number + EOL_OFF, that runs() turns into the run.
EOL_ON, EOL_OFF = '\ue002', '\ue003'
EOL_TOKEN = re.compile(f'{EOL_ON}(\\d+){EOL_OFF}')
EOLS = []  # the line ends of the sicha being assembled, by number
EOL_LINES = []  # and the read line each one ends, for a fix to find its line


def eol(kind, b, line=None):
    EOLS.append({'eol': kind, 'page': b['page'], 'box': b['box']})
    EOL_LINES.append(line)
    return f'{EOL_ON}{len(EOLS) - 1}{EOL_OFF}'


def fix_line(part, pos, old, new, why):
    """A fix reconcile() is sure of, written on the read line it belongs to as
    'fixed' (the line's text as the print has it) so the line goes back into the
    training data (Shmuly 2026-10-05): the line is the one whose end token comes
    next in the part, and the old text must stand once in it."""
    m = EOL_TOKEN.search(part, pos)
    line = EOL_LINES[int(m.group(1))] if m else None
    if line and line.get('text', '').count(old) == 1:
        line['fixed'] = line['text'].replace(old, new)
        line['fix'] = why


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
    text = re.sub(f'{FACE_OFF}((?:{EOL_ON}\\d+{EOL_OFF})? *){FACE_ON}', r'\1', text)
    # A single letter judged Miram at the head of a word whose other letters are
    # Frank is noise, not a face (the כ of כראוי, broken over a line as „כ־ + ראוי):
    # the real pattern is the reverse, a Frank prefix on a Miram word (הבהמית).
    text = re.sub(f'(?<![א-ת]){FACE_ON}([א-ת]){FACE_OFF}(?=[א-ת])', r'\1', text)
    # A closing quote or apostrophe glued to a Miram word is set with it (בו ית'; Shmuly
    # 2026-10-02); the opening „ before a word is not.
    text = re.sub(f'{FACE_OFF}(["\'\u05f3\u05f4]+)', r'\1' + FACE_OFF, text)
    prev = ''
    for k, piece in enumerate(re.split(f'[{FACE_ON}{FACE_OFF}]', text)):
        marks = ['b'] if k % 2 else None
        pos = 0
        # A mark right after a word in the other face (ד'17) after a Miram ד') opens
        # this piece, where the look-behind has nothing to see.
        lead = NOTE_START.match(piece) if prev and not prev[-1].isspace() and not prev[-1].isdigit() else None
        if lead:
            out.append({'note': note_id(lead.group(1))})
            pos = lead.end(1) + 1
        prev = piece or prev
        for m in MARK.finditer(piece, pos):
            if m.start() > pos:
                out.append({'text': piece[pos:m.start()], **({'marks': marks} if marks else {})})
            out.append({'note': note_id(m.group(1))})
            pos = m.end()
        if pos < len(piece):
            out.append({'text': piece[pos:], **({'marks': marks} if marks else {})})
    # the line ends out of the words, as runs of their own
    done = []
    for r in out:
        if 'text' not in r or EOL_ON not in r['text']:
            done.append(r); continue
        pos = 0
        for m in EOL_TOKEN.finditer(r['text']):
            if m.start() > pos:
                done.append({**r, 'text': r['text'][pos:m.start()]})
            done.append(dict(EOLS[int(m.group(1))]))
            pos = m.end()
        if pos < len(r['text']):
            done.append({**r, 'text': r['text'][pos:]})
    for r in done:
        if 'text' in r and UNLINKED in r['text']:
            r['text'] = r['text'].replace(UNLINKED, ')')
    return done


UNLINKED = '\ue004'  # the bracket of a mark reconcile() found no note for, so runs() leaves it as text


def spaced_marks(paras, notes):
    """Some volumes' marks are read with a space before them ("חז"ל 2)", vols 15-25):
    a number with a bracket after a space is a mark when a note carries that number
    (and the bracket read twice, "מבול 7))", or before "?", vol 15 p. 83 had 12
    such). Run after the notes' labels are settled, or a note numbered wrong as
    read leaves its mark unlinked (vol 15 p. 83's note 12)."""
    labels = {n['label'] for n in notes if n['label'].isdigit()}
    spaced = re.compile(r'(?<=[^\s\d]) (\d{1,3})\)(?![א-ת\d])')
    for p in paras:
        p['parts'] = [spaced.sub(lambda m: m.group(1) + ')' if m.group(1) in labels else m.group(0), part) if isinstance(part, str) and not p['heading'] else part for part in p['parts']]


def reconcile(paras, notes):
    """The notes and their marks checked against each other over the whole sicha
    (Shmuly 2026-10-05: see from the references whether a number was skipped, and
    throw the unused ones). The print numbers a sicha's notes 1, 2, 3 … and calls
    each once from the body, so a label out of sequence between its neighbours
    (35, 3, 37, or a lost "?") is the number the sequence wants; a mark no note
    carries, standing between the marks of n-1 and n+1 where note n has no mark,
    is n read wrong; a mark with no note anywhere is noise and is left as text."""
    number = lambda n: int(n['label']) if n['label'].isdigit() else None
    fixed = 0
    # A line opening with a number and a bracket inside a note, "1) למה נתעכב … 2) למה
    # לא", or "48) וכדמוכח" citing note 48, was taken for a note of its own: when the
    # note after it carries the number the sequence wanted here, the line goes back
    # into the note before it, number and all.
    i = 1
    while i < len(notes):
        n = notes[i]
        prev = next((number(x) for x in reversed(notes[:i]) if number(x) is not None), 0)
        nxt = next((number(x) for x in notes[i + 1:] if number(x) is not None), None)
        if number(n) is not None and number(n) != prev + 1 and nxt == prev + 1:
            notes[i - 1]['text'] = join(notes[i - 1]['text'], n['label'] + ') ' + n['text'])
            for b in n['boxes']:
                merge_box(notes[i - 1]['boxes'], b)
            n['_into'] = notes[i - 1]  # the page layout's lines still point at it
            del notes[i]; fixed += 1
        else:
            i += 1
    numbered = [n for n in notes if number(n) is not None or n['label'] == '?']
    for i, n in enumerate(numbered):
        prev = next((number(x) for x in reversed(numbered[:i]) if number(x) is not None), 0)
        nxt = next((number(x) for x in numbered[i + 1:] if number(x) is not None), None)
        want = prev + 1
        if number(n) == want:
            continue
        # the neighbours agree on this note's number: the next note is want+1, or this
        # is the sicha's last note and its label is lost; a run of lost labels counts up
        if nxt == want + 1 or (nxt is None and n['label'] == '?') or (n['label'] == '?' and nxt is not None and nxt > want):
            if not any(number(x) == want for x in numbered):
                n['label'] = str(want); fixed += 1
    spaced_marks(paras, notes)
    labels = [n['label'] for n in notes]
    # A mark read with stars before its number ("עמיתך"*43)") where no note carries
    # the stars but note 43 has no mark of its own: the stars are a speck or the
    # quote's tail, and the mark is 43 (vol 15 p. 83).
    called = {m.group(1) for p in paras if not p['heading'] for part in p['parts'] if isinstance(part, str) for m in MARK.finditer(part)}
    for p in paras:
        if p['heading']:
            continue
        p['parts'] = [re.sub(r'(?<=[^\s\d])\*{1,3}(\d{1,3})\)', lambda m: m.group(1) + ')' if m.group(0)[:-1] not in labels and m.group(1) in labels and m.group(1) not in called else m.group(0), part)
                      if isinstance(part, str) else part for part in p['parts']]
    # every mark in reading order, with where it stands: (paragraph, part, match)
    found = [(p, k, m) for p in paras if not p['heading'] for k, part in enumerate(p['parts']) if isinstance(part, str) for m in list(MARK.finditer(part))]
    have_mark = {m.group(1) for _, _, m in found}
    uncalled = sorted(int(l) for l in labels if l.isdigit() and l not in have_mark)
    # a mark no note carries: n when it stands between the marks of n-1 and n+1 (or
    # at the sicha's end after n-1) and note n has no mark; else noise
    edits = []
    for j, (p, k, m) in enumerate(found):
        lab = m.group(1)
        if lab in labels:
            continue
        before = next((int(x.group(1)) for _, _, x in reversed(found[:j]) if x.group(1).isdigit() and x.group(1) in labels), 0)
        after = next((int(x.group(1)) for _, _, x in found[j + 1:] if x.group(1).isdigit() and x.group(1) in labels), None)
        fits = [n for n in uncalled if before < n and (after is None or n < after)]
        if len(fits) == 1 and lab.isdigit() and abs(len(lab) - len(str(fits[0]))) <= 1:
            edits.append((p, k, m, str(fits[0]) + ')')); uncalled.remove(fits[0]); fixed += 1
            fix_line(p['parts'][k], m.start(), m.group(0), str(fits[0]) + ')', 'mark from the gap')
        else:
            edits.append((p, k, m, lab + UNLINKED))
    # A mark read as another note's number, one digit off (5 read as 3: "[n34]" between
    # the marks of 53 and 55 while note 54 has no mark, 2026-10-05): when its neighbours'
    # marks are in order and exactly one uncalled note fits between them, it is that note.
    done = {id(m) for _, _, m, _ in edits}
    nums = [(j, int(m.group(1))) for j, (_, _, m) in enumerate(found) if m.group(1).isdigit() and m.group(1) in labels and id(m) not in done]
    for x, (j, v) in enumerate(nums):
        before = nums[x - 1][1] if x > 0 else 0
        after = nums[x + 1][1] if x + 1 < len(nums) else None
        if after is None or not before < after or before < v < after:
            continue
        fits = [n for n in uncalled if before < n < after]
        # and note v is called from elsewhere too, so taking this mark leaves it its own
        # (one of 12 checked broke this: a true 45) between 43 and 46 taken for 44)
        if sum(1 for _, w in nums if w == v) < 2:
            continue
        if len(fits) == 1 and len(str(fits[0])) == len(str(v)) and sum(a != b for a, b in zip(str(fits[0]), str(v))) == 1:
            p, k, m = found[j]
            edits.append((p, k, m, str(fits[0]) + ')')); uncalled.remove(fits[0]); fixed += 1
            fix_line(p['parts'][k], m.start(), m.group(0), str(fits[0]) + ')', 'mark digit from the sequence')
    edits.sort(key=lambda e: (id(e[0]), e[1], e[2].start()))
    for p, k, m, new in reversed(edits):  # from the end, so earlier spans keep their places
        p['parts'][k] = p['parts'][k][:m.start()] + new + p['parts'][k][m.end():]
    # a note whose label the sequence settled: its first line as the print has it
    for n in notes:
        line = n.get('line')
        if not line or n['label'] == '?':
            continue
        text = pointed(fix_dots(tidy(line.get('text', '').strip())))
        m = re.match(r'^(\*{0,3}\d{0,3}|\?)\)\s*', text)
        if m and m.group(1) != n['label']:
            line['fixed'] = n['label'] + ') ' + text[m.end():]
            line['fix'] = 'label from the sequence'
    return fixed


def unfaced(text):
    return EOL_TOKEN.sub('', text.replace(FACE_ON, '').replace(FACE_OFF, ''))


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
    tail = re.search(f'{EOL_ON}\\d+{EOL_OFF}$', a)
    token = tail.group(0) if tail else ''
    if token:
        a = a[:tail.start()]
        if not a:  # a note whose first line held only its number
            return token + b
    if a.endswith(('-', '־')):
        head, first = a[:-1], b.split(' ', 1)[0]
        last = head.split(' ')[-1]
        # On vol 39, 932 of 933 line-end makafs were broken words, so the makaf
        # stays only for a compound the library itself writes with one.
        strip = lambda w: re.sub(r'^[^א-ת]+|[^א-ת"\']+$', '', w)
        if first.startswith('־'):  # the print carries the makaf over: בשבת־ / ־קודש
            return head + token + b
        if strip(last) + '־' + strip(first) in COMPOUNDS:
            return a + token + b
        if token:
            EOLS[int(EOL_TOKEN.match(token).group(1))]['split'] = True
        return head + token + b
    return a + token + ' ' + b


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
            # the stretch from its first letter to its last (with a closing quote), the
            # marks around it outside
            m = re.match(r'^([^א-ת]*)(.*[א-ת]["\'\u05f3\u05f4]*)(.*)$', piece, re.S)
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
    EOLS.clear(); EOL_LINES.clear()
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
            b = box(line, shape, pdf_page)
            cur['parts'].append(text + eol('line', b, line)); merge_box(cur['boxes'], b); line['_in'] = cur
            cur = None  # the body after it starts a paragraph of its own
        # Which printed line ends a column, and which the page: the last line with words.
        ends = lambda cols: {id(c[-1]): 'column' for c in [[l for l in col if l.get('text', '').strip()] for col in cols] if c}
        body_end = ends(lay['body'])
        if body_end:
            body_end[list(body_end)[-1]] = 'page'
        for col in lay['body']:
            if not col:
                continue
            left, right = edges(col)
            prev_short = False
            for i, line in enumerate(col):
                text = pointed(fix_dots(tidy(line.get('text', '').strip())))
                if not text:
                    continue
                b = box(line, shape, pdf_page)
                end = eol(body_end.get(id(line), 'line'), b, line)
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
                    cur['parts'][-1] = join(cur['parts'][-1], text) + end
                else:
                    cur['parts'].append(text + end)
                merge_box(cur['boxes'], b)
                line['_in'] = cur
                prev_short = short
        note_end = ends(lay['notes'])
        if note_end:
            note_end[list(note_end)[-1]] = 'page'
        for col in lay['notes']:
            for line in col:
                text = pointed(fix_dots(tidy(line.get('text', '').strip())))
                if not text:
                    continue
                b = box(line, shape, pdf_page)
                end = eol(note_end.get(id(line), 'line'), b, line)
                m = NOTE_START.match(text)
                lost = None
                if not m and note is None and text.startswith(')'):
                    # The page's first note lost its number: it is the first mark in the
                    # body that no note has taken yet.
                    seen = [int(x) for p in paras for part in p['parts'] if isinstance(part, str) for x in re.findall(r'(\d{1,3})\)', part)]
                    taken = {int(x['label']) for x in notes if x['label'].isdigit()}
                    free = [x for x in seen if x not in taken]
                    if free:
                        lost = str(min(free)); text = text[1:].lstrip()
                last_num = next((x['label'] for x in reversed(notes) if x['label'].isdigit()), None)
                if not m and not lost and note is not None and text.startswith(')') and last_num:
                    # The reader lost the number of a note's opening "3)" and kept the
                    # bracket: a line opening with ")" after note k is note k+1, not
                    # more of note k (page 62 of vol 33 lost three this way), even
                    # when a star note stands between (notes 8 and 9 of vol 15 p. 7).
                    lost = str(int(last_num) + 1)
                    text = text[1:].lstrip()
                if m or lost or note is None:
                    label = m.group(1) if m else lost or '?'
                    # Three levels of notes: numbered (set in Frank; *14 is a note added
                    # later under an existing number, still the first level), stars alone
                    # *, **, *** (called from inside a note; set in Miram, stressed words
                    # in Frank), and, very rarely, a third in Hadassah.
                    note = {'label': label, 'level': 2 if label.strip('*') == '' and label != '?' else 1, 'text': (text[m.end():] if m else text) + end, 'boxes': []}
                    note['line'] = line  # its first printed line, for a label fix to go back to
                    notes.append(note)
                else:
                    note['text'] = join(note['text'], text) + end
                merge_box(note['boxes'], b)
                line['_in'] = note
    for p in paras:
        p['parts'] = [unsplit_stars(part) if isinstance(part, str) else part for part in p['parts']]
    for n in notes:
        n['text'] = unsplit_stars(n['text'])
    reconcile(paras, notes)
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
        last = next((i for i in range(len(text) - 1, -1, -1) if 'text' in text[i]), None)
        if p['heading'] and last is not None:
            # A sicha's title ends with its letter, בהעלותך ב; the reader gives a lone
            # letter after the parsha as a digit and bracket ("בהעלותך 2)"), which
            # runs() would take for a footnote mark. The letter comes back.
            m = re.search(r' (\d)\)$', text[last]['text'])
            if m and int(m.group(1)) >= 1:
                text[last] = {**text[last], 'text': text[last]['text'][:m.start()] + ' ' + 'אבגדהוזחט'[int(m.group(1)) - 1]}
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
                                          'box': box(line, (h, w), pdf_page)['box'], 'in': owner(line).get('id'),
                                          **({'fixed': line['fixed'], 'fix': line['fix']} if line.get('fixed') else {}),
                                          'marks': [{'label': x['label'], 'x0': fx(x['x0']), 'x1': fx(x['x1'])} for x in line.get('marks', [])],
                                          'words': [{'text': x['text'], 'x0': fx(x['x0']), 'x1': fx(x['x1']), 'conf': x['conf'], **({'face': x['face']} if x.get('face') else {})} for x in line.get('words', [])]})
        # the notes that open on this page: their level and where each is called from
        starts = {}
        for col in lay['notes']:
            for line in col:
                n = owner(line)
                if n and 'label' in n and n['id'] not in starts:
                    starts[n['id']] = n
        page['notes'] = [{'id': n['id'], 'label': n['label'], 'level': n['level'], 'called_from': n.get('called_from')} for n in starts.values()]
        layout.append(page)
    return pt, layout


def owner(line):
    """The paragraph or note a read line went into (through a note reconcile() folded back)."""
    n = line.get('_in', {})
    while '_into' in n:
        n = n['_into']
    return n


def plain(pt):
    """The page text as readable lines, for checking by eye: [n] a mark, {238} a page."""
    v = pt['versions'][0]
    show = lambda runs: ''.join('' if 'eol' in r else (f"⟪{r['text']}⟫" if 'small' in (r.get('marks') or []) else f"⦃{r['text']}⦄" if 'ois' in (r.get('marks') or []) else f"⟨{r['text']}⟩" if r.get('marks') else r['text']) if 'text' in r else (f"[{r['note'][1:].replace('s', '*')}]" if 'note' in r else f"{{{r['marker']}}}") for r in runs)
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
