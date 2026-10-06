"""Read a FontCreator project (.fcp) into a TrueType font, since FontCreator
itself is not at hand. Worked out from the files: a PNG-like signature, a
chunk table (tag, compressed flag, length, offset); the FONT chunk is zlib
data cut into 2048-byte blocks stored out of order (their order listed
first). Inside, each glyph is a record: sizes, a signature, its name
(UTF-16), bounding boxes, then its contours as points (x, y as doubles,
a flag 1 on the curve, 0 off it: quadratic, as TrueType), and its advance
width as a float after the contours."""
import re, struct, sys, zlib

SIG = b'\x00\x8f\x78\xf8\x00\x00\x00\x00\x00'


def font_chunk(path):
    b = open(path, 'rb').read()
    table = {}
    for m in re.finditer(rb'(META|FONT|XPRT|PSET)', b[:120]):
        s = m.end()
        table[m.group().decode()] = (b[s + 4], *struct.unpack('<II', b[s + 5:s + 13]))
    comp, ln, off = table['FONT']
    raw = b[off:off + ln]
    n, bs = struct.unpack('<II', raw[:8])
    order = struct.unpack(f'<{n}I', raw[8:8 + 4 * n])
    data = raw[8 + 4 * n:]
    blocks = [data[i * bs:(i + 1) * bs] for i in range(n)]
    return zlib.decompress(b''.join(blocks[order.index(i)] for i in range(n)))


def contours_at(d, p, limit):
    """Contours starting at p ('02 00 00 <count>'), or None if they don't parse."""
    if d[p] not in (1, 2) or d[p + 1:p + 3] != b'\0\0':
        return None
    nc, q, out = d[p + 3], p + 4, []
    if nc == 0 or nc > 60:
        return None
    for _ in range(nc):
        if q + 5 > limit:
            return None
        count = struct.unpack('>H', d[q + 3:q + 5])[0]
        q += 5
        if count == 0 or q + count * 17 > limit:
            return None
        pts = []
        for _ in range(count):
            x, y = struct.unpack('<dd', d[q:q + 16]); f = d[q + 16]
            if f > 1 or not (-3000 < x < 5000 and -3000 < y < 5000):
                return None
            pts.append((x, y, f)); q += 17
        out.append(pts)
    return out, q


def glyphs(d):
    starts = [m.start() - 12 for m in re.finditer(re.escape(SIG), d)]
    for i, s in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(d)
        nl = d[s + 21]
        name = d[s + 23:s + 23 + nl].decode('utf-16le', 'replace')
        body = s + 23 + nl
        found = None
        for p in range(body, min(end - 5, body + 600)):
            r = contours_at(d, p, end)
            if r:
                found = r; break
        adv = None
        if found:
            q = found[1]
            m = d[q:q + 40]
            # The advance: the first float after the contours that is a plausible width.
            for k in range(0, 36):
                v = struct.unpack('<f', m[k:k + 4])[0]
                if 50 < v < 4000 and v == round(v, 2):
                    adv = v; break
        yield name, (found[0] if found else []), adv, (s, end)


if __name__ == '__main__':
    d = font_chunk(sys.argv[1])
    for name, cs, adv, _ in glyphs(d):
        print(f'{name:30s} contours={len(cs):2d} points={sum(map(len, cs)):4d} adv={adv}')


# Glyph names as FontCreator writes them, to their characters.
HEBREW = 'alef bet gimel dalet he vav zayin het tet yod finalkaf kaf lamed finalmem mem finalnun nun samekh ayin finalpe pe finaltsadi tsadi qof resh shin tav'.split()
NAMES = {f'{n}-hebr': 0x05D0 + i for i, n in enumerate(HEBREW)}
NAMES.update({
    'shevacomb-hebr': 0x05B0, 'hatafsegolcomb-hebr': 0x05B1, 'hatafpatahcomb-hebr': 0x05B2, 'hatafqamatscomb-hebr': 0x05B3,
    'hiriqcomb-hebr': 0x05B4, 'tserecomb-hebr': 0x05B5, 'segolcomb-hebr': 0x05B6, 'patahcomb-hebr': 0x05B7, 'qamatscomb-hebr': 0x05B8,
    'holamcomb-hebr': 0x05B9, 'holamhaserforvavcomb-hebr': 0x05BA, 'qubutscomb-hebr': 0x05BB, 'dageshormapiqcomb-hebr': 0x05BC,
    'metegcomb-hebr': 0x05BD, 'maqaf-hebr': 0x05BE, 'rafecomb-hebr': 0x05BF, 'punctuationpaseq-hebr': 0x05C0, 'shindotcomb-hebr': 0x05C1,
    'sindotcomb-hebr': 0x05C2, 'punctuationsofpasuq-hebr': 0x05C3, 'qamatsqatancomb-hebr': 0x05C7,
    'punctuationgeresh-hebr': 0x05F3, 'punctuationgershayim-hebr': 0x05F4,
    'space': 0x20, 'exclam': 0x21, 'quotedbl': 0x22, 'quotesingle': 0x27, 'parenleft': 0x28, 'parenright': 0x29, 'asterisk': 0x2A,
    'comma': 0x2C, 'hyphenminus': 0x2D, 'period': 0x2E, 'slash': 0x2F, 'colon': 0x3A, 'semicolon': 0x3B, 'less': 0x3C, 'equal': 0x3D,
    'greater': 0x3E, 'question': 0x3F, 'bracketleft': 0x5B, 'backslash': 0x5C, 'bracketright': 0x5D, 'underscore': 0x5F,
    'endash': 0x2013, 'emdash': 0x2014, 'quotedblright': 0x201D, 'quotedblbase': 0x201E, 'bullet': 0x2022,
})
NAMES.update({n: 0x30 + i for i, n in enumerate('zero one two three four five six seven eight nine'.split())})


def advance_of(d, s, e, q):
    if q is not None:
        return struct.unpack('<f', d[q + 8:q + 12])[0]
    # A glyph with no outline (a space): the float before the run of 02 bytes that ends its record.
    k = d.find(b'\x02\x02\x02\x02\x02\x02', s, e)
    for off in range(k - 1, s + 24, -1):
        v = struct.unpack('<f', d[off - 3:off + 1])[0]
        if 50 < v < 4000 and v == round(v):
            return v
    return 0


def to_ttf(path, out, family):
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.pens.pointPen import SegmentToPointPen
    d = font_chunk(path)
    outlines, widths, cmap = {'.notdef': []}, {'.notdef': 500}, {}
    for name, cs, _, (s, e) in glyphs(d):
        if name not in NAMES and name != '.notdef':
            continue
        q = None
        for p in range(s + 23, min(e - 5, s + 700)):
            r = contours_at(d, p, e)
            if r:
                q = r[1]; break
        outlines[name] = cs
        widths[name] = int(round(advance_of(d, s, e, q)))
        if name in NAMES:
            cmap[NAMES[name]] = name
    order = ['.notdef'] + [n for n in outlines if n != '.notdef']
    fb = FontBuilder(2048, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    glyf = {}
    for n in order:
        pen = TTGlyphPen(None)
        for c in outlines[n]:
            # TrueType flags: 1 on the curve. Start the contour on an on-curve point.
            k = next((i for i, (_, _, f) in enumerate(c) if f), 0)
            c = c[k:] + c[:k]
            from fontTools.pens.pointPen import PointToSegmentPen
            pp = PointToSegmentPen(pen)
            pp.beginPath()
            for x, y, f in c:
                pp.addPoint((round(x), round(y)), 'qcurve' if f else None)
            pp.endPath()
        glyf[n] = pen.glyph()
    fb.setupGlyf(glyf)
    fb.setupHorizontalMetrics({n: (widths[n], 0) for n in order})
    fb.setupHorizontalHeader(ascent=1900, descent=-600)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=1900, sTypoDescender=-600, usWinAscent=1900, usWinDescent=600)
    fb.setupPost()
    fb.save(out)
