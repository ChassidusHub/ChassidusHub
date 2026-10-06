"""Synthetic training lines: text set in a font (or built from real letters
cut from the scans), then aged the way print and a 300 dpi black-and-white
scan age it: ink spread or thinning, rough edges, specks and small breaks,
a slight tilt. A footnote mark, 14), is set small and raised, as printed.

    python3 synth.py <font> <texts.txt> <out dir> <count> [seed]"""
import os, random, re, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

MARK = re.compile(r'(\*?\d{1,3}\))')


def render(text, font_path, px, bold_font=None):
    """A line of text at a letter height of about px pixels, as grey ink on white, set right to left."""
    size = int(px * 1.75)
    font = ImageFont.truetype(font_path, size, layout_engine=ImageFont.Layout.RAQM)
    small = ImageFont.truetype(font_path, int(size * 0.62), layout_engine=ImageFont.Layout.RAQM)
    parts = [p for p in MARK.split(text) if p]
    widths = [(small if MARK.fullmatch(p) else font).getlength(p, direction='rtl') for p in parts]
    W, H = int(sum(widths) + size), int(size * 1.9)
    im = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(im)
    x = W - size // 2
    for p, w in zip(parts, widths):
        if MARK.fullmatch(p):
            # A footnote mark: its number reads left to right; set small and raised.
            d.text((x - w, int(size * 0.28)), p, font=small, fill=0, direction='ltr')
        else:
            d.text((x, int(size * 0.45)), p, font=font, fill=0, anchor='ra', direction='rtl')
        x -= w
    return crop(np.array(im))


def crop(a, pad=6):
    ys, xs = np.where(a < 128)
    if not len(ys):
        return a
    return a[max(0, ys.min() - pad):ys.max() + pad, max(0, xs.min() - pad):xs.max() + pad]


def age(a, rng):
    """Grey ink on white -> an aged bitonal scan line."""
    ink = 1 - a.astype(np.float32) / 255
    # The print sets letters a little further apart than the font does.
    ink = ndimage.zoom(ink, (1, rng.uniform(1.0, 1.12)), order=1)
    ink = ndimage.rotate(ink, rng.uniform(-0.4, 0.4), reshape=True, order=1)
    ink = ndimage.gaussian_filter(ink, rng.uniform(0.4, 1.3))
    # Rough edges: noise at the scale of a pixel or two, strongest where the ink is half-tone.
    noise = ndimage.gaussian_filter(rng.normal(0, 1, ink.shape), rng.uniform(0.5, 1.2))
    ink = ink + noise * rng.uniform(0.04, 0.16)
    # Ink spread or thinning: where the scan's black-and-white cut falls.
    out = ink > rng.uniform(0.32, 0.62)
    # Small breaks in the ink, and lone specks (a pixel, so not taken for a point).
    for _ in range(rng.integers(0, 6)):
        y, x = rng.integers(0, out.shape[0]), rng.integers(0, out.shape[1])
        if out[y, x]:
            out[max(0, y - 1):y + 1, max(0, x - 1):x + 1] = False
        elif not out[max(0, y - 4):y + 4, max(0, x - 4):x + 4].any():
            out[y, x] = True
    return np.where(out, 0, 255).astype(np.uint8)


def from_letters(text, store, rng, gap):
    """A line built from real letters cut from the scans: each letter a random copy of its usual size."""
    from buildfont import typical, unpack
    cache = store.setdefault('_typical', {})
    glyphs = []
    for ch in re.sub(r'\d+', lambda m: m.group()[::-1], text).translate(str.maketrans('()[]', ')(][')):
        if ch == ' ':
            glyphs.append(None); continue
        if ch not in cache:
            if len(store.get(ch, [])) < 50:
                return None
            cache[ch] = typical(store[ch])
        keep, mh, mw, mt = cache[ch]
        r = keep[rng.integers(len(keep))]
        glyphs.append((unpack(r), r['top']))
    tops = [t for g in glyphs if g for t in [g[1]]]
    bottoms = [g[1] + g[0].shape[0] for g in glyphs if g]
    top, bottom = min(tops), max(bottoms)
    H = bottom - top + 12
    W = sum(g[0].shape[1] + gap + 2 if g else int(gap * 3.2) for g in glyphs) + 12
    canvas = np.zeros((H, W), np.float32)
    x = W - 6
    for g in glyphs:
        if g is None:
            x -= int(gap * 3.2); continue
        img, t = g
        y = t - top + 6
        x -= img.shape[1]
        canvas[y:y + img.shape[0], x:x + img.shape[1]] = np.maximum(canvas[y:y + img.shape[0], x:x + img.shape[1]], img)
        x -= int(max(0, gap + rng.normal(0, 0.7)))
    return np.where(canvas > 0.5, 0, 255).astype(np.uint8)[:, max(0, x - 6):]


if __name__ == '__main__':
    font, texts, out, count = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    rng = np.random.default_rng(int(sys.argv[5]) if len(sys.argv) > 5 else 0)
    lines = [l.strip() for l in open(texts) if l.strip()]
    os.makedirs(out, exist_ok=True)
    for i in range(count):
        t = lines[rng.integers(len(lines))]
        a = age(render(t, font, rng.uniform(26, 34)), rng)
        Image.fromarray(a).save(f'{out}/{i:06d}.png')
        open(f'{out}/{i:06d}.gt.txt', 'w').write(t + '\n')
