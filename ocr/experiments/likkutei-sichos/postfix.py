"""Rules after reading, for marks the print sets one way and the reader spaces
another (7 of the 49 wrong lines on the vol 39 test, 2026-10-04):

- spaced dots are always ". . ." (the reader writes ".. ." or ". .." when a dot
  is faint): any run of two or more dots, spaced or not, with nothing but spaces
  between, becomes dots with single spaces, as the typed text sets them
- a star that marks a note is followed by a space before a letter (ראה* נחמי')
- no space before ":" or ")" after a word, as the print never has one

    from postfix import tidy; tidy('.. . וה׳') -> '. . . וה׳'"""
import re

DOTS = re.compile(r'(?<![\d.])(?:\.\s?){2,}(?!\d)')
STAR = re.compile(r'\*(?=\ue000?[א-ת])')  # \ue000 opens a Miram span (recog.FACE_ON)
SPACE_BEFORE = re.compile(r' +(?=[:)])')


def tidy(text):
    text = DOTS.sub(lambda m: ' '.join('.' * m.group(0).count('.')) + ' ', text)
    text = STAR.sub('* ', text)
    text = SPACE_BEFORE.sub('', text)
    return re.sub(r'  +', ' ', text).strip()


if __name__ == '__main__':
    for t in ('.. . וה׳ אלקי', '. .. והשי"ת', 'ראה*נחמי׳ (ח, טו)', 'הכללית):קדושת', 'מעתיק. איז', 'ע׳ 94 (ס"ה). לקמן', 'כו׳ . . . אויף'):
        print(t, '->', tidy(t))
