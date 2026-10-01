"""Fake training lines for the new typeface (vols 15-39), three kinds:

  realcopy  every letter a real copy cut from the scans (scanned Frank, and
            scanned Miram for stressed words), placed with small random shifts
  varied    a font (scanned Frank 60%, Shmuly's Frank 40%; Miram for stress)
            aged with synth.age, so the ink varies letter to letter
  clean     the same fonts, barely aged: for the first, clean stage

A few words in some lines are set in Miram, as Likkutei Sichos stresses
them, sometimes all but a leading ה or ו. The label is the plain text: which
face a letter is in is measured after reading (light.py), not read.

    python3 gen.py <kind> <lines.txt> <out dir> <count> [seed]

lines.txt holds printed lines (the typed text of vols 30-38 as paired with
the scans), one per row: b or n (body or footnote), the line's width in the
scan, and the text, tab-separated."""
import os, pickle, re, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from synth import MARK, age, crop
from buildfont import typical, unpack
from harvest import visual

HERE = os.path.dirname(os.path.abspath(__file__)) + '/..'
FRANK = [(f'{HERE}/fonts/RebbeHubFrankLS.otf', 0.6), (f'{HERE}/fonts/FrankLubavitch.ttf', 0.4)]
MIRAM = {f'{HERE}/fonts/RebbeHubFrankLS.otf': f'{HERE}/fonts/RebbeHubMiramLS.otf',
         f'{HERE}/fonts/FrankLubavitch.ttf': f'{HERE}/fonts/MiramLubavitch.ttf'}


def stress(text, rng):
    """[(text, is_miram)] runs: in about a third of lines, one to three words
    set in Miram, sometimes without their leading ה or ו."""
    words = text.split(' ')
    marked = set()
    if rng.random() < 0.35:
        cand = [i for i, w in enumerate(words) if re.fullmatch(r'[„"]?[א-ת]{2,}[",.:;]?', w)]
        if cand:
            i = cand[rng.integers(len(cand))]
            marked.update(range(i, min(len(words), i + 1 + int(rng.integers(0, 3)))))
    runs = []
    for i, w in enumerate(words):
        piece = (' ' if i else '') + w
        if i in marked:
            lead = re.match(r'[„"]?[הו]', w) if rng.random() < 0.3 else None
            if lead and lead.end() < len(w):
                runs += [((' ' if i else '') + w[:lead.end()], False), (w[lead.end():], True)]
                continue
            runs.append((piece, True))
        else:
            runs.append((piece, False))
    return runs


POINTS = re.compile('[\u05b0-\u05c7]')
BELOW = set(chr(c) for c in range(0x5b0, 0x5bc)) - {'\u05b9', '\u05ba'} | {'\u05c7'}


def ink(ch, font, cache={}):
    """A character's ink as an image, cropped, cached by font."""
    key = (ch, font.path, font.size)
    if key not in cache:
        n = font.size * 3
        im = Image.new('L', (n, n), 0)
        ImageDraw.Draw(im).text((n // 2, n * 2 // 3), ch, font=font, fill=255, anchor='ls')
        a = np.array(im)
        ys, xs = np.nonzero(a > 40)
        cache[key] = Image.fromarray(255 - a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]) if len(ys) else None
    return cache[key]


def draw_pointed(im, x, base, text, font):
    """Pointed text drawn letter by letter, right to left from x on the baseline,
    each point centred on its own letter: the converted fonts carry no mark
    positioning, so a font left alone puts vowels beside the letter, not under it.
    Returns the width used."""
    d = ImageDraw.Draw(im)
    x0, size = x, font.size
    for m in re.finditer('([^\u05b0-\u05c7])([\u05b0-\u05c7]*)', text):
        ch, marks = m.group(1), m.group(2)
        w = font.getlength(ch)
        d.text((x, base), ch, font=font, fill=0, anchor='rs')
        if ch.strip() and marks:
            bx0, by0, bx1, by1 = font.getbbox(ch, anchor='rs')
            cx, top = x + (bx0 + bx1) / 2, base + by0
            below = base + size * 0.07
            for k in marks:
                g = ink(k, font)
                if g is None:
                    continue
                mw, mh = g.size
                if k == '\u05bc':  # dagesh: in the letter's middle
                    pos = (cx - mw / 2, base + by0 / 2 - mh / 2)
                elif k == '\u05c1':  # shin dot: over the right arm
                    pos = (x + bx1 - mw, top - mh - size * 0.05)
                elif k in '\u05c2\u05b9\u05ba':  # sin dot, holam: over the left
                    pos = (x + bx0, top - mh - size * 0.05)
                elif k == '\u05bf':  # rafe: a bar above
                    pos = (cx - mw / 2, top - mh - size * 0.05)
                else:  # vowels under the letter
                    pos = (cx - mw / 2, below)
                    below += mh + size * 0.03
                im.paste(0, (int(pos[0]), int(pos[1])), Image.eval(g, lambda v: 255 - v))
        x -= w
    return x0 - x


def render_runs(runs, frank, px, width=None):
    """Vector setting of runs, right to left on one baseline; marks small and raised.
    The fonts keep the print's long dash at U+2013, so — is set with it. Given a
    width, the line is justified to it by widening the spaces, as the print does."""
    runs = [(t.replace('—', '–'), m) for t, m in runs]
    size = int(px * 1.75)
    fonts = {False: ImageFont.truetype(frank, size, layout_engine=ImageFont.Layout.RAQM),
             True: ImageFont.truetype(MIRAM[frank], size, layout_engine=ImageFont.Layout.RAQM)}
    small = ImageFont.truetype(frank, int(size * 0.62), layout_engine=ImageFont.Layout.RAQM)
    parts = [(q, m) for t, m in runs for p in MARK.split(t) if p for q in re.split('( )', p) if q]
    # A mark's number reads left to right and its bracket, set in a right-to-left
    # line, shows mirrored: "14)" is drawn "(14". Raised and small after a word;
    # full size where it opens a footnote.
    shown = [('(' + p[:-1] if MARK.fullmatch(p) else p) for p, m in parts]
    raised = [bool(MARK.fullmatch(p)) and k > 0 for k, (p, m) in enumerate(parts)]
    face = [small if r else (fonts[False] if MARK.fullmatch(p) else fonts[m]) for (p, m), r in zip(parts, raised)]
    widths = [f.getlength(t, direction='ltr' if MARK.fullmatch(p) else 'rtl') for f, t, (p, m) in zip(face, shown, parts)]
    spaces = [k for k, (p, m) in enumerate(parts) if p == ' ']
    if width and spaces and 0.5 * width < sum(widths) < width:
        extra = (width - sum(widths)) / len(spaces)
        for k in spaces:
            widths[k] += extra
    W, H = int(sum(widths) + size), int(size * 2)
    im = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(im)
    x, base = W - size // 2, int(size * 1.35)
    for (p, m), t, f, r, w in zip(parts, shown, face, raised, widths):
        if p == ' ':
            pass
        elif MARK.fullmatch(p):
            d.text((x - w, base - (int(size * 0.45) if r else 0)), t, font=f, fill=0, anchor='ls', direction='ltr')
        elif POINTS.search(t):
            w = draw_pointed(im, x, base, t, f)
        else:
            d.text((x, base), t, font=f, fill=0, anchor='rs', direction='rtl')
        x -= w
    return crop(np.array(im))


class Copies:
    """Real letter copies by face and size: 'F:' Frank and 'L:' Miram body
    letters, 'nF:' footnote-size Frank for raised marks."""
    def __init__(self):
        self.s = {}
        for f in (f'{HERE}/frank/letters.pkl', f'{HERE}/miram/letters_ok.pkl', f'{HERE}/frank/points.pkl'):
            st = pickle.load(open(f, 'rb'))
            self.s.update({k: v for k, v in st.items() if ':' in k})
        self.t = {}
        self.xh = float(np.median([r['xh'] for r in self.s['F:ב'][:500]]))

    def pick(self, key, rng):
        if key not in self.t:
            if len(self.s.get(key, [])) < 50:
                return None
            self.t[key] = typical(self.s[key])
        keep = self.t[key][0]
        r = keep[rng.integers(len(keep))]
        return unpack(r), r['top']


def raster(ch, font, xh):
    """A letter drawn from a font at the scans' size, as (image, top against the
    baseline): for marks the scans gave too few copies of (punctuation, nikud)."""
    f = ImageFont.truetype(font, max(8, int(round(xh / 0.6))), layout_engine=ImageFont.Layout.RAQM)
    im = Image.new('L', (int(xh * 4), int(xh * 4)), 0)
    base = int(xh * 2.5)
    ImageDraw.Draw(im).text((int(xh), base), ch.replace('—', '–'), font=f, fill=255, anchor='ls')
    a = np.array(im) > 127
    ys, xs = np.nonzero(a)
    if not len(ys):
        return None
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32), int(ys.min()) - base


def from_copies(runs, cp, rng, gap=3, width=None):
    """A line built from real letters; None if a letter has too few copies and no
    font has it. Points are set on their letter (under it, or in it for a dagesh,
    over it for the shin and sin dots and holam); spaces are widened to justify
    the line to a width, as printed."""
    glyphs = []  # [image, top against the baseline, [(point image, point)]] or None for a space
    for t, m in runs:
        for p in MARK.split(t):
            if not p:
                continue
            mark = bool(MARK.fullmatch(p))
            raised = mark and bool(glyphs)
            # Glyphs are laid right to left. A mark "14)" shows "(14", so from the right:
            # 4, 1, (. Hebrew is already in that order, a point just after its letter.
            chars = ('(' + p[:-1])[::-1] if mark else visual(p)
            for ch, pts in re.findall('([^\u05b0-\u05c7])([\u05b0-\u05c7]*)', chars):
                if ch == ' ':
                    glyphs.append(None); continue
                # A pointed letter is taken whole from the scans (אַ, אָ, פּ), point and all.
                g = cp.pick('F:' + ch + pts, rng) if pts else None
                if g is not None:
                    glyphs.append([g[0], g[1] + int(round(rng.normal(0, 0.4))), []])
                    continue
                key = ('nF:' if raised else ('L:' if m and '\u05d0' <= ch <= '\u05ea' else 'F:')) + ch
                g = cp.pick(key, rng)
                if g is None and m:
                    g = cp.pick('F:' + ch, rng)
                if g is None:
                    g = raster(ch, f'{HERE}/fonts/RebbeHub{"Miram" if m else "Frank"}LS.otf', cp.xh * (0.75 if raised else 1))
                if g is None:
                    return None
                img, top = g
                glyphs.append([img, top - (14 if raised else 0) + int(round(rng.normal(0, 0.4))), []])
                for k in pts:  # points the scans gave too few of: drawn from the font
                    pg = raster(k, f'{HERE}/fonts/RebbeHub{"Miram" if m else "Frank"}LS.otf', cp.xh)
                    if pg is not None:
                        glyphs[-1][2].append((pg[0], k))
    if not any(glyphs):
        return None
    steps = [g[0].shape[1] + max(0, round(gap + rng.normal(0, 0.7))) if g else int(rng.uniform(9, 14)) for g in glyphs]
    spaces = [k for k, g in enumerate(glyphs) if g is None]
    if width and spaces and 0.5 * width < sum(steps) < width:
        extra = (width - sum(steps)) / len(spaces)
        for k in spaces:
            steps[k] += int(round(extra))
    top = min(g[1] for g in glyphs if g) - 14
    bottom = max(g[1] + g[0].shape[0] for g in glyphs if g) + 24
    H, W = bottom - top + 12, sum(steps) + 24
    canvas = np.zeros((H, W), np.float32)
    x = W - 12
    for g, step in zip(glyphs, steps):
        if g is None:
            x -= step; continue
        img, t, points = g
        y = t - top + 6
        x0 = x - img.shape[1]
        canvas[y:y + img.shape[0], x0:x] = np.maximum(canvas[y:y + img.shape[0], x0:x], img)
        under = -top + 6 + 3  # the baseline, plus a little
        for pi, k in points:
            ph, pw = pi.shape
            cx = x0 + img.shape[1] // 2
            if k == '\u05bc':
                py, px_ = y + img.shape[0] // 2 - ph // 2, cx - pw // 2
            elif k in '\u05c1':
                py, px_ = y - ph - 2, x - pw
            elif k in '\u05c2\u05b9\u05ba':
                py, px_ = y - ph - 2, x0
            elif k == '\u05bf':
                py, px_ = y - ph - 2, cx - pw // 2
            else:
                py, px_ = under, cx - pw // 2
                under += ph + 2
            py, px_ = max(0, py), max(0, px_)
            region = canvas[py:py + ph, px_:px_ + pw]
            canvas[py:py + ph, px_:px_ + pw] = np.maximum(region, pi[:region.shape[0], :region.shape[1]])
        x -= step
    return crop(np.where(canvas > 0.5, 0, 255).astype(np.uint8))


def light_age(a, rng):
    from scipy import ndimage
    ink = ndimage.gaussian_filter(1 - a.astype(np.float32) / 255, rng.uniform(0.3, 0.6))
    return np.where(ink > rng.uniform(0.45, 0.55), 0, 255).astype(np.uint8)


COLUMN = 578  # a column's text width in the scans, in pixels at 300 dpi


def make(kind, text, rng, cp=None, note=False, width=None):
    """One fake line. Footnote lines are set smaller, as printed (about 0.83 of
    the body's size). The line is justified to the width the same text has in
    the scan (a paragraph's last line is short there, and stays short)."""
    runs = stress(text, rng)
    width = (width or COLUMN) + rng.normal(0, 3)
    scale = 0.83 if note else 1.0
    if kind == 'realcopy':
        a = from_copies(runs, cp, rng, width=width / scale)
        if a is not None and note:
            a = np.array(Image.fromarray(a).resize((int(a.shape[1] * scale), int(a.shape[0] * scale)), Image.LANCZOS))
            a = np.where(a < 128, 0, 255).astype(np.uint8)
        return a
    frank = FRANK[0][0] if rng.random() < FRANK[0][1] else FRANK[1][0]
    # Sized to the scans' letters (x-height about 26 px at 300 dpi); Shmuly's Frank
    # sets a little larger for the same size.
    a = render_runs(runs, frank, rng.uniform(24, 27) * (1.0 if frank == FRANK[0][0] else 0.94) * scale, width)
    return age(a, rng) if kind == 'varied' else light_age(a, rng)


if __name__ == '__main__':
    kind, texts, out, count = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    rng = np.random.default_rng(int(sys.argv[5]) if len(sys.argv) > 5 else 0)
    # texts: one printed line per row, a footnote line marked by a leading tab.
    # Leftovers of the library's markup ([ftnref_…]) are not print.
    lines = [l.rstrip('\n').split('\t', 2) for l in open(texts)]
    lines = [(t, k == 'n', int(w)) for k, w, t in lines if len(t) > 8 and not re.search(r'[A-Za-z_]', t)]
    cp = Copies() if kind == 'realcopy' else None
    os.makedirs(out, exist_ok=True)
    i = 0
    while i < count:
        t, note, w = lines[rng.integers(len(lines))]
        a = make(kind, t, rng, cp, note, w)
        if a is None:
            continue
        Image.fromarray(a).save(f'{out}/{i:06d}.png')
        open(f'{out}/{i:06d}.gt.txt', 'w').write(t + '\n')
        i += 1
