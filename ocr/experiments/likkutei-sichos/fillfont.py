"""Fills letters a scanned font has too few copies of from the original
font they match (Shmuly's Miram for the scanned Miram), scaled so its ב is
as tall and wide as the scanned ב.

    python3 fillfont.py <scanned.otf> <original.ttf> <letters> <out.otf>"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.psCharStrings import T2CharString


def bounds(font, ch):
    gs = font.getGlyphSet()
    p = BoundsPen(gs)
    gs[font.getBestCmap()[ord(ch)]].draw(p)
    return p.bounds


if __name__ == '__main__':
    scanned, original, letters, out = sys.argv[1:5]
    f, o = TTFont(scanned), TTFont(original)
    (ax0, ay0, ax1, ay1), (bx0, by0, bx1, by1) = bounds(f, 'ב'), bounds(o, 'ב')
    k = (ay1 - ay0) / (by1 - by0)
    og = o.getGlyphSet()
    cff = f['CFF '].cff
    top = cff.topDictIndex[0]
    cs = top.CharStrings
    for ch in letters:
        name = f'uni{ord(ch):04X}'
        src = o.getBestCmap().get(ord(ch))
        if not src or name in f.getGlyphOrder():
            continue
        pen = T2CharStringPen(0, None)
        og[src].draw(TransformPen(pen, (k, 0, 0, k, 0, 0)))
        c = pen.getCharString(private=top.Private, globalSubrs=cff.GlobalSubrs)
        order = f.getGlyphOrder() + [name]
        cs.charStrings[name] = len(cs.charStringsIndex)
        cs.charStringsIndex.append(c)
        top.charset.append(name)
        f.setGlyphOrder(order)
        f['hmtx'].metrics[name] = (round(o['hmtx'].metrics[src][0] * k), round(o['hmtx'].metrics[src][1] * k))
        for t in f['cmap'].tables:
            t.cmap[ord(ch)] = name
        print('filled', ch, 'from', original)
    f['maxp'].numGlyphs = len(f.getGlyphOrder())
    f['hhea'].numberOfHMetrics = len(f.getGlyphOrder())
    f.save(out)
