"""Face labels for real training lines: each word's letters measured against the
same letter's median thickness over the lines of its page (light.py), a run of two
or more thin letters whose shapes are closer to the Miram outline than the Frank
one is Miram, and the label is rewritten with those letters as Miram symbols
(face.py). Output: a jsonl row per line {p, label, miram: [[start, end]]}.

    facelabel.py <list.txt> <out.jsonl> [--shard i/n]

Lines are grouped by their page (pairs/<vol>/<vol>_<page>_...) so the medians
come from the same page, as in light.py. A line whose ink does not split into
its letters is left as it is (no face)."""
import argparse, json, os, re, sys, time
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import face
from light import line_words, thin_runs, looks_miram, HEB
from harvest import visual

HERE = os.path.dirname(os.path.abspath(__file__)) + '/..'
MIRAM_FONT, FRANK_FONT = f'{HERE}/fonts/RebbeHubMiramLS.otf', f'{HERE}/fonts/RebbeHubFrankLS.otf'
PAGE = re.compile(r'(\d+_\d{4})_[bn]\d+\.png$')


def label_of(p):
    return open(p[:-4] + '.gt.txt', encoding='utf-8').read().strip()


def page_lines(paths):
    """{page: [paths]} keeping the list's order."""
    by = {}
    for p in paths:
        m = PAGE.search(p)
        by.setdefault(m.group(1) if m else p, []).append(p)
    return by


def face_page(paths, out):
    rows, meas = [], []
    for p in paths:
        try:
            a = np.array(Image.open(p).convert('L'))
            text = label_of(p)
            l = {'y0': 0, 'y1': a.shape[0], 'x0': 0, 'x1': a.shape[1], 'text': text}
            ws = line_words(a, l)
        except Exception as e:
            ws = []; text = ''
        meas.append((p, text, ws))
    per = {}
    for p, text, ws in meas:
        for wd, gl, base, xh in ws:
            if HEB.match(wd):
                for ch, x in zip(wd, gl):
                    per.setdefault(ch, []).append(x[1] / x[2])
    med = {ch: float(np.median(v)) for ch, v in per.items() if len(v) >= 5}
    for p, text, ws in meas:
        spans = []
        if text:
            # words in the label, in order, matched to the measured words by text
            tokens = text.split(' '); pos = 0; k = 0
            by_text = {}
            for w in ws:
                by_text.setdefault(w[0], []).append(w)
            for tok in tokens:
                start = pos; pos += len(tok) + 1
                vis = visual(tok)
                w = by_text.get(vis)
                if not w or not HEB.match(vis) or not all(ch in med for ch in vis):
                    continue
                wd, gl, base, xh = w.pop(0)
                ratios = [x[1] / x[2] / med[ch] for ch, x in zip(wd, gl)]
                for i, j in thin_runs(wd, ratios):
                    ok = 0
                    for ch, (glyph, area, sk, g) in zip(wd[i:j], gl[i:j]):
                        sample = {'img': np.packbits(glyph), 'shape': glyph.shape}
                        ok += looks_miram(ch, sample, MIRAM_FONT, FRANK_FONT)[0]
                    if ok >= max(2, (j - i + 1) // 2):  # most of the run looks Miram in shape too
                        spans.append([start + i, start + j])
        lab = text
        if spans:
            runs, pos = [], 0
            for a0, b0 in spans:
                runs += [(text[pos:a0], False), (text[a0:b0], True)]; pos = b0
            runs.append((text[pos:], False))
            lab = face.to_face(runs)
        out.write(json.dumps({'p': p, 'label': lab, 'miram': spans}, ensure_ascii=False) + '\n')
    return sum(1 for r in meas)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('list'); ap.add_argument('out'); ap.add_argument('--shard', default='0/1')
    a = ap.parse_args()
    i, n = map(int, a.shard.split('/'))
    paths = [l.strip() for l in open(a.list) if l.strip()]
    by = page_lines(paths)
    pages = sorted(by)[i::n]
    t = time.time(); done = 0
    with open(a.out, 'w', encoding='utf-8') as f:
        for k, pg in enumerate(pages):
            done += face_page(by[pg], f)
            if k % 20 == 0:
                print(f'face {i}: {k}/{len(pages)} pages, {done} lines, {round(time.time() - t)} s', flush=True)
    print(f'face {i}: done {done} lines {round(time.time() - t)} s', flush=True)
