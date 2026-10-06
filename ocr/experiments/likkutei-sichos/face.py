"""The face of each letter in a label: Miram (the light face, the print's stress)
or Frank. For training, a Miram letter is written as its own symbol, a private-use
codepoint (U+E100 + the letter's place in the alphabet), so the reading model
learns the face along with the letter and its reading says which letters are
Miram; from_face() turns such a text back into plain text and the Miram spans.

    face.to_face([('text', is_miram), ...]) -> label
    face.from_face(label) -> (plain text, [[start, end], ...])"""
import re

BASE = 0xE100
ALEF, TAV = 0x05D0, 0x05EA


def miram(ch):
    return chr(BASE + ord(ch) - ALEF) if ALEF <= ord(ch) <= TAV else ch


def is_miram(ch):
    return BASE <= ord(ch) <= BASE + TAV - ALEF


def plain(ch):
    return chr(ALEF + ord(ch) - BASE) if is_miram(ch) else ch


def to_face(runs):
    return ''.join(''.join(miram(c) for c in t) if m else t for t, m in runs)


def from_face(label):
    """Plain text and the Miram stretches [start, end) in it."""
    out, spans, start = [], [], None
    for i, ch in enumerate(label):
        if is_miram(ch):
            if start is None:
                start = i
        elif start is not None:
            spans.append([start, i]); start = None
        out.append(plain(ch))
    if start is not None:
        spans.append([start, len(label)])
    return ''.join(out), spans


def mark_text(text, spans):
    """Plain text with the Miram stretches wrapped in  …  (assemble.runs reads them)."""
    out, pos = [], 0
    for a, b in spans:
        out += [text[pos:a], '', text[a:b], '']; pos = b
    out.append(text[pos:])
    return ''.join(out)


ALPHABET = [chr(BASE + i) for i in range(TAV - ALEF + 1)]  # the 27 Miram symbols, for a model's codec
