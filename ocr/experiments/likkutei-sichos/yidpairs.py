"""Yiddish training lines from volumes with no typed text (self-training): a
read line becomes a training pair only when the reader was sure of every word
(confidence 0.99 or more), every word is known (the library's vocabulary or a
word the reader read sure five times or more), no star was put in from the ink,
and the line is Yiddish. Hosafos pages are left out (a different layout, never
examples for sichos; Shmuly 2026-10-02).

python3 yidpairs.py VOCAB READDIR OUTDIR VOL [VOL ...]
READDIR/<vol>/lay/*.json from readsicha.py; the scans from lsdata/pdf.
Writes OUTDIR/<vol>/<stem>_<page>_yNNN.png + .gt.txt and prints counts."""
import collections, glob, json, os, re, sys
import numpy as np, pymupdf
from PIL import Image
from layout import deskew, scan
import pointing
from weakspots import core, is_known, load_vocab

YID = re.compile('[ַָֿ]|(^| )(און|איז|ניט|דער|דאָס|וואָס|אַז|נישט|זיך|זיין|מיט|פון|אויף|ווי|אויך)( |$)')
PAD = 4


def lines_of(lay):
    for key in ('body', 'notes'):
        for col in lay.get(key, []):
            for l in (col if isinstance(col, list) else [col]):
                if isinstance(l, dict) and l.get('words'):
                    yield key, l


def main():
    vocab = collections.Counter(load_vocab(sys.argv[1]))
    rd, out, vols = sys.argv[2], sys.argv[3], sys.argv[4:]
    seen = collections.Counter()
    for v in vols:
        for f in glob.glob(f'{rd}/{v}/lay/*.json'):
            for _, l in lines_of(json.load(open(f))):
                for w in l['words']:
                    if w.get('conf', 1) >= 0.97:
                        seen[core(w['text'])] += 1
    vocab.update({w: n for w, n in seen.items() if n >= 5})
    # The reader drops the point under a Yiddish alef, and the dagesh in פּ, far more
    # than it makes one up (נאך 1,856 times for נאָך 448 on vols 15-25, where the print
    # has the kamatz). Choosing the reader's commonest spelling (as until 2026-10-04)
    # wrote נאך into every label and taught the next reader the same; now the
    # pointing is the typed text's (pointing.py), and the reader's own points stay.
    total = kept = 0
    why = collections.Counter()
    for v in vols:
        os.makedirs(f'{out}/{v}', exist_ok=True)
        for pdf in sorted(glob.glob(f'{rd}/{v}/lay/*_01.json')):
            stem = os.path.basename(pdf)[:-8]
            pages = sorted(glob.glob(f'{rd}/{v}/lay/{stem}_*.json'))
            doc = None
            for pf in pages:
                lay = json.load(open(pf))
                if 'הוספות' in lay.get('head', {}).get('text', ''):
                    why['hosafos page'] += 1
                    continue
                todo = []
                for key, l in lines_of(lay):
                    total += 1
                    text = re.sub('[]', '', l['text']).strip()
                    if l.get('stars_from_ink'):
                        why['star from ink'] += 1; continue
                    if not YID.search(text):
                        why['not yiddish'] += 1; continue
                    # a line-opening dash or note number is read less surely than words, but
                    # leaving out every line that has one taught the reader to drop them (yid1)
                    # (and a line-ending dash the same: no kept Yiddish line ended with one before
                    # 2026-10-05, though 1,490 of them are printed so; edgedash.py found them)
                    last = len(l['words']) - 1
                    edge = lambda k, w: ((k == 0 and (w['text'] == '—' or re.fullmatch(r'\d{1,3}\)', w['text']))) or (k == last and w['text'] == '—')) and w.get('conf', 1) >= 0.5
                    if any(w.get('conf', 1) < 0.99 and not edge(k, w) for k, w in enumerate(l['words'])):
                        why['a word below 0.99'] += 1; continue
                    ws = [core(w['text']) for w in l['words']]
                    if any(len(re.sub('[^א-ת]', '', w)) >= 2 and not is_known(w, vocab) for w in ws):
                        why['an unknown word'] += 1; continue
                    text = pointing.fix(text)
                    if len(text) < 8:
                        why['too short'] += 1; continue
                    todo.append(text and (l, text))
                if not todo:
                    continue
                if doc is None:
                    doc = pymupdf.open(f'/home/user/lsdata/pdf/{stem}.pdf')
                a = scan(doc, int(pf[-7:-5]) - 1)
                if a is None:
                    continue
                a = deskew(a)
                if list(a.shape) != list(lay['shape']):
                    why['page shape differs'] += len(todo); continue
                h, w = a.shape
                for k, (l, text) in enumerate(todo):
                    crop = a[max(0, l['y0'] - PAD):min(h, l['y1'] + PAD), max(0, l['x0'] - PAD):min(w, l['x1'] + PAD)]
                    name = f'{out}/{v}/{os.path.basename(pf)[:-5]}_y{k:03d}'
                    Image.fromarray(crop).save(name + '.png')
                    open(name + '.gt.txt', 'w', encoding='utf-8').write(text)
                    kept += 1
        print(f'vol {v}: {kept} lines kept so far', flush=True)
    print(f'{kept} of {total} lines kept; left out: {dict(why.most_common())}')


if __name__ == '__main__':
    main()
