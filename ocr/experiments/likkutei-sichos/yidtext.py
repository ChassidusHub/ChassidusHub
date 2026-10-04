"""Yiddish text for fake training lines, from the Whisper training transcripts
(the Rebbe's farbrengens, checked word for word; Shmuly 2026-10-02), set in
Likkutei Sichos' own spelling and broken into printed-line lengths.

The transcripts are written unpointed (וואס, דאס, אז); LS points the alef
(וואָס, דאָס, אַז) and writes פּ. Each word takes the spelling the reader read
most for the same letters across the read volumes (five times the next, at
least ten times). A line is kept only when every word is one the read volumes
have, so the fakes never teach a spelling the print does not use.

The Chabad Library's Yiddish is a second source (Shmuly 2026-10-02, "the
Rebbe's own Yiddish"): the pages of its crawl (/mnt/project-files/chabadlibrary/
texts/<book>.jsonl) written mostly in Yiddish, the Rebbe's letters and the
Rebbe Rayatz's Sefer HaSichos, about 700,000 words in the same Chassidic
spelling as LS. Each page's paragraphs are a source's clips.

python3 yidtext.py READDIR OUT.txt CLIPS.jsonl [CLIPS.jsonl | LIBRARY.jsonl ...] --vols 15 16 17
OUT.txt is gen.py's lines file: b <tab> width in the scan <tab> text."""
import collections, glob, html, json, re, sys
import numpy as np
import pointing
from weakspots import core

POINTS = '[ְ-ׂ]'
YID = re.compile('[ַָֿ]|(^| )(און|איז|ניט|דער|דאָס|וואָס|אַז|נישט|זיך)( |$)')


COMMON = {'איז', 'דער', 'ניט', 'אויף', 'וואס', 'זיך', 'דאס', 'אויך', 'נישט', 'מען', 'זיין', 'פון', 'מיט', 'ווי', 'אז', 'האט', 'ווערט', 'וועגן'}


def texts(fn):
    """A source's paragraphs: a clip's text, or a Yiddish library page's paragraphs
    (a page counts as Yiddish when more than 8% of its words are common Yiddish
    words; its footnotes and markup left out)."""
    for line in open(fn, encoding='utf-8'):
        d = json.loads(line)
        if 'heading' not in d:
            yield d['text']; continue
        page = re.sub(r'<div class="pagenumber">.*?</div>|<a [^>]*>[^<]*</a>|\[/?[a-z_0-9]+\]', ' ', d.get('text', ''), flags=re.S)
        page = html.unescape(page)
        words = re.findall('[א-ת]+', re.sub('<[^>]+>', ' ', page))
        if not words or sum(w in COMMON for w in words) < 0.08 * len(words):
            continue
        for para in re.split(r'</p>|<br\s*/?>', page):
            para = re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', para)).strip()
            if len(para) > 20:
                yield para


def main():
    args = sys.argv[1:]
    vols = args[args.index('--vols') + 1:]; args = args[:args.index('--vols')]
    rd, out, clips = args[0], args[1], args[2:]
    forms = collections.defaultdict(collections.Counter)
    widths, ratio = [], []
    for v in vols:
        for f in glob.glob(f'{rd}/{v}/lay/*.json'):
            lay = json.load(open(f))
            for col in lay.get('body', []):
                for l in col:
                    text = re.sub('[]', '', l.get('text', ''))
                    if not l.get('words') or not YID.search(text):
                        continue
                    for w in l['words']:
                        if w.get('conf', 1) >= 0.97:
                            c = core(w['text'])
                            forms[re.sub(POINTS, '', c)][c] += 1
                    widths.append(l['x1'] - l['x0']); ratio.append(len(text) / max(1, l['x1'] - l['x0']))
    # The pointing is the typed text's (pointing.py), not the readers': the readers
    # drop the point under an alef and the dagesh in פּ far too often to teach from.
    known = {bare for bare, c in forms.items() if sum(c.values()) >= 3}
    full = int(np.percentile(widths, 75)); per_px = float(np.median(ratio))
    print(f'{len(known)} known words, full line {full} px, {per_px:.4f} chars a px')
    seen, words = set(), []
    for cf in clips:
        for t in texts(cf):
            t = t.strip()
            if t in seen:
                continue
            seen.add(t)
            t = t.replace('״', '"').replace('׳', "'")  # as the print sets them, and the reader reads them
            t = re.sub(r'(^|[\s(])"(?=\S)', r'\1„', t)  # an opening quote is set low, „
            words += t.split() + ['¶']  # a clip's end ends a paragraph
    lines, cur, drop = [], [], collections.Counter()
    target = full * per_px
    def flush(short=False):
        if not cur:
            return
        text = ' '.join(cur)
        ok = all(re.sub(POINTS, '', core(w)) in known or len(re.sub('[^א-ת]', '', core(w))) < 2 for w in cur)
        if ok:
            lines.append(f'b\t{int(len(text) / per_px) if short else full}\t{text}')
        else:
            drop['a word the print never has'] += 1
        cur.clear()
    for w in words:
        if w == '¶':
            flush(short=True); continue
        w = pointing.fix(w)
        if cur and len(' '.join(cur + [w])) > target:
            flush()
        cur.append(w)
    flush(short=True)
    open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'{len(lines)} lines written; left out: {dict(drop)}')


if __name__ == '__main__':
    main()
