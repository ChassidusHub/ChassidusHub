"""Rules after reading, for marks the print sets one way and the reader spaces
another (7 of the 49 wrong lines on the vol 39 test, 2026-10-04):

- spaced dots are always ". . ." (the reader writes ".. ." or ". .." when a dot
  is faint): any run of two or more dots, spaced or not, with nothing but spaces
  between, becomes dots with single spaces, as the typed text sets them
- a star that marks a note is followed by a space before a letter (ראה* נחמי')
- no space before ":" or ")" after a word, as the print never has one
- a point read after a mark's digits goes back onto the letter before the mark

Rules from Shmuly's 922 checked lines of vols 15-25 (2026-10-05):

- a note mark sits on its word: "רש"י 84)" is "רש"י84)" (20 of his fixes; the
  raised digit has a little space before it in the print, the reader and 2,088
  Yiddish labels wrote it as a space). Not inside brackets ("(ע' 102)"), not
  after a word that cites a note or page ("הערה 13)"), not in a list "1) ... 2)"
- dots that cut a quote off stand apart from the word: "בידו . . ויעזוב" (the
  Chabad Library text glues them, "בידו. ."; he spaced them 6 times)
- a dash between words has a space on each side ("— מרכבה", "לר"ה —"), except
  next to a bracket ("(— אַלע", "קרח —)"), and "——" is one dash ("־־" one maqaf)
- no star mark against a quote: the ink step (recog.add_stars) takes the
  ticks of a closing quote or gershayim for a star, "„ויברכם*) "" for
  "„ויברכם"" (11 of his fixes; no typed label has a star against a quote)

    from postfix import tidy; tidy('.. . וה׳') -> '. . . וה׳'"""
import re

DOTS = re.compile(r'(?<![\d.])(?:\.\s?){2,}(?!\d)')
STAR = re.compile(r'\*(?=\ue000?[א-ת])')  # \ue000 opens a Miram span (recog.FACE_ON)
SPACE_BEFORE = re.compile(r' +(?=[:)])')
# אָפ35ּ) for אָפּ35): the dagesh (or another point) of the letter before a raised
# mark comes out after the mark's digits (vols 15-25, and vol 39's אָפ138ּ))
POINT_AFTER_MARK = re.compile(r'([א-ת])(\*{0,3}\d{1,3})([\u0591-\u05bd\u05bf-\u05c7]+)\)')
SPACED_MARK = re.compile(r'([א-ת"\'׳״\u0591-\u05c7]) (\d{1,3})\)(?!\))')
CITES = re.compile(r'(הער|^ע[\'׳]$|^עמ[\'׳]$|^סי[\'׳]$|^ס[\'׳]$|^שם$)')
DOTS_AFTER_WORD = re.compile(r'([^\s.(\[„"])(?=\. \.)')
STAR_AT_QUOTE = re.compile(r'\*{1,3}\) ?(?=["\'׳״])|(?<=["\'׳״])\*{1,3}\) (?=[,.;:])')
DASH_GLUED = re.compile(r'(?<=[^\s(\[—])—|—(?=[^\s)\]—.,;:])')


def glue_marks(text):
    """"רש"י 84)" -> "רש"י84)", outside brackets, citations and lists."""
    head = re.match(r'^\*{0,3}\d{0,3}\*{0,3}\)', text)
    off = head.end() if head else 0
    body = text[off:]

    def one(m):
        before = body[:m.start() + 1]
        if before.count('(') > before.count(')') or before.count('[') > before.count(']'):
            return m.group(0)
        if CITES.search(before.split()[-1]):
            return m.group(0)
        n = int(m.group(2))
        if n == 1 or re.search(r'(^| )%d\)' % (n + 1), body[m.end():]) or re.search(r'(^| )%d\)' % (n - 1), body[:m.start()]):
            return m.group(0)
        return m.group(1) + m.group(2) + ')'
    return text[:off] + SPACED_MARK.sub(one, body)


def tidy(text):
    text = DOTS.sub(lambda m: ' '.join('.' * m.group(0).count('.')) + ' ', text)
    text = STAR.sub('* ', text)
    text = SPACE_BEFORE.sub('', text)
    text = POINT_AFTER_MARK.sub(r'\1\3\2)', text)
    text = STAR_AT_QUOTE.sub('', text)
    text = glue_marks(text)
    text = DOTS_AFTER_WORD.sub(r'\1 ', text)
    text = re.sub('——+', '—', text)
    text = re.sub('־־+', '־', text)
    text = DASH_GLUED.sub(lambda m: (' ' if m.start() else '') + '—' + (' ' if m.end() < len(text) else ''), text)
    return re.sub(r'  +', ' ', text).strip()


if __name__ == '__main__':
    for t in ('.. . וה׳ אלקי', '. .. והשי"ת', 'ראה*נחמי׳ (ח, טו)', 'הכללית):קדושת', 'מעתיק. איז', 'ע׳ 94 (ס"ה). לקמן', 'כו׳ . . . אויף', 'ווי רש"י 84) זאָגט', '(ע׳ 102) דשלשה', 'בידו. . ויעזוב', '—מרכבה העליונה', 'עיקר— עשיית', '(— אַלע', 'גו׳ —— זאָלט', 'הערה 13).', 'דער „ויברכם*) " דאָ', 'וכמש*) "נ כי נר', 'מחורב גו׳"*) , אויספירנדיק'):
        print(t, '->', tidy(t))
