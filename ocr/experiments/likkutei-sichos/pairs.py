"""Silver line pairs from the first pass: each line the model read is found
in the Chabad Library's typed text of its printed page (body lines in the
body, footnote lines in the notes), and the typed words of that stretch,
written as printed, become its label. Kept only where the reading and the
typed text nearly agree; where they differ one of the two is wrong.

The typed text is written as printed: a footnote mark [[14]] as 14), an
opening quote as „, and a word the print breaks at a line end (the typed
text keeps a soft hyphen there) ends that line with -."""
import glob, io, json, os, re, sys
import numpy as np
import pymupdf
from PIL import Image
from rapidfuzz import fuzz
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from layout import deskew, scan

MIN_SCORE = 90
SHY = '­'


def printed(word):
    word = re.sub(r'\[\[(\*{0,3}\d*)\]\]', r'\1)', word).replace('-', '־')
    return re.sub(r'(^|(?<=[(\[—]))"(?=\S)', '„', word)


def pieces(text):
    """The words of a text in order; a word the print may break is split at
    its soft hyphen into pieces, the first marked as ending a line with a makaf
    (־), as the print sets it; a hyphen inside the text is a makaf in print too."""
    out = []
    for word in text.split():
        parts = word.split(SHY)
        for i, part in enumerate(parts):
            if part:
                out.append((printed(part), i < len(parts) - 1))
    return out


def label(ps):
    """The printed line for a run of pieces, or None if a break falls inside it."""
    if any(h for _, h in ps[:-1]):
        return None
    return ' '.join(p for p, _ in ps) + ('־' if ps[-1][1] else '')


def norm(s):
    return re.sub(r'\s+', ' ', s.replace('„', '"').replace(',,', '"')).strip()


def best_in(text, ps, starts, k):
    best = (0, None, None)
    t = norm(text)
    for s in starts:
        for n in range(max(1, k - 2), k + 3):
            if s < 0 or s + n > len(ps):
                continue
            lab = label(ps[s:s + n])
            if lab is None:
                continue
            score = fuzz.ratio(t, norm(lab))
            if score > best[0]:
                best = (score, s, n)
    return best


def align(lines, ps):
    """Lines in reading order against the pieces of one stream: for each line,
    [line, labels (a list of printed words), score]."""
    cursor, out = 0, []
    for line in lines:
        text = line.get('text', '')
        if len(text) < 4:
            continue
        k = len(text.split())
        score, s, n = best_in(text, ps, range(cursor - 2, cursor + 7), k)
        if score < 80:
            wide = best_in(text, ps, range(len(ps)), k)
            if wide[0] > score:
                score, s, n = wide
        if s is None:
            continue
        out.append({'line': line, 's': s, 'n': n, 'words': [p for p, _ in ps[s:s + n]], 'hyph': ps[s + n - 1][1]})
        if score >= 80:
            cursor = s + n
    split_words(out, ps)
    for o in out:
        lab = ' '.join(o['words']) + ('־' if o['hyph'] else '')
        yield o['line'], lab, fuzz.ratio(norm(o['line']['text']), norm(lab))


def split_words(out, ps):
    """A word the print breaks at a line end where the typed text has no soft
    hyphen: the two lines each took all of it, or one took it and the other
    none. Where the end of one reading and the start of the next together
    make that word, give each line its part, the first ending with -."""
    for a, b in zip(out, out[1:]):
        if a['hyph'] or not a['words'] or not b['words']:
            continue
        ta, tb = a['line']['text'].split(), b['line']['text'].split()
        if not ta or not tb:
            continue
        x, y = norm(ta[-1]).rstrip('-־'), norm(tb[0])
        for j in {a['s'] + a['n'] - 1, b['s']}:
            if j >= len(ps) or ps[j][1]:
                continue
            w = ps[j][0]
            whole = fuzz.ratio(x + y, norm(w))
            if whole < 80 or whole < max(fuzz.ratio(x, norm(w)), fuzz.ratio(y, norm(w))) + 10:
                continue
            k = max(range(1, len(w)), key=lambda k: fuzz.ratio(x, norm(w[:k])) + fuzz.ratio(y, norm(w[k:])), default=None)
            if k is None:
                continue
            a_end, b_start = a['s'] + a['n'], b['s']
            a['words'] = [p for p, _ in ps[a['s']:j]] + [w[:k]]
            a['n'] = j - a['s'] + 1
            a['hyph'] = True
            b['words'] = [w[k:]] + [p for p, _ in ps[j + 1:b['s'] + b['n']]]
            b['n'] = b['s'] + b['n'] - j
            b['s'] = j
            break


def letters(s):
    return re.sub(r'[^\u05d0-\u05ea]', '', s)


def keep(ocr, lab, score):
    """Near agreement; or, where the line has footnote marks (which the first
    pass reads badly, being small and raised), agreement in the letters."""
    if score >= MIN_SCORE:
        return True
    return bool(re.search(r'[\d*]\)', lab)) and fuzz.ratio(letters(re.sub(r'\*{0,3}\d*\)', '', lab)), letters(ocr)) >= 95


def truth_streams(vol, page):
    f = f'truth/{vol}_{page:04d}.json'
    if not os.path.exists(f):
        return None
    t = json.load(open(f))
    body = pieces(t['body'])
    notes = pieces(' '.join(f'{m}) {x}' for m, x in t['notes'].items()))
    return body, notes


def page_score(lay, streams):
    body, notes = streams
    lines = [l for c in lay['body'] for l in c][:6]
    return np.mean([best_in(l['text'], body, range(len(body)), len(l['text'].split()))[0] for l in lines if len(l.get('text', '')) >= 4] or [0])


def page_image(pdf, p):
    return deskew(scan(pdf, p))


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'pairs'
    only = sys.argv[2] if len(sys.argv) > 2 else None
    os.makedirs(out, exist_ok=True)
    report = open(f'{out}/report.jsonl', 'a')
    for done in sorted(glob.glob('ocr/*.done')):
        stem = os.path.basename(done)[:-5]
        if only and not stem.startswith(only):
            continue
        vol, start = map(int, stem.split('_'))
        pdf = pymupdf.open(f'pdf/{stem}.pdf')
        for f in sorted(glob.glob(f'ocr/{stem}_[0-9][0-9].json')):
            p = int(f[-7:-5])
            lay = json.load(open(f))
            # The printed page: the pdf's page counted from the sicha's first page, or one either side.
            cands = [(page_score(lay, s), start + p + d) for d in (0, -1, 1) if (s := truth_streams(vol, start + p + d))]
            if not cands:
                continue
            score, page = max(cands)
            if score < 70:
                print(stem, p, 'no page matches', round(score), flush=True)
                continue
            body, notes = truth_streams(vol, page)
            a = None
            kept = total = 0
            for key, ps in (('body', body), ('notes', notes)):
                lines = [l for c in lay[key] for l in c]
                for i, (line, lab, sc) in enumerate(align(lines, ps)):
                    total += 1
                    name = f'{vol}_{page:04d}_{key[0]}{i:02d}'
                    report.write(json.dumps({'name': name, 'score': round(sc, 1), 'ocr': line['text'], 'label': lab}, ensure_ascii=False) + '\n')
                    if not keep(line['text'], lab, sc):
                        continue
                    if a is None:
                        a = page_image(pdf, p)
                    h, w = a.shape
                    crop = a[max(0, line['y0'] - 6):min(h, line['y1'] + 6), max(0, line['x0'] - 6):min(w, line['x1'] + 6)]
                    Image.fromarray(crop).save(f'{out}/{name}.png')
                    open(f'{out}/{name}.gt.txt', 'w').write(lab + '\n')
                    kept += 1
            print(stem, p, '->', page, f'{kept}/{total}', flush=True)
