"""Bring training and test labels to the transcription rules of postfix.tidy
(Shmuly's 922 checks, 2026-10-05: marks on their word, ". ." apart from the
word, a dash spaced on both sides). The labels came from two places that
each had their own habit: the Chabad Library text glues dots to the word
("בידו. .") and sometimes writes two dots where the print has three (the
ink decides, inkdots.py), and the self-trained Yiddish labels copied the
reader's spaced marks ("רש"י 84)", 2,088 lines) and a doubled maqaf (777) and
Yiddish points on Hebrew words in quotes. A reader learns whatever the labels
say, so the labels say it one way.

python3 retidy.py LOG DIR [DIR ...] [--write]
Prints the lines changed per directory; --write rewrites them and appends
{gt, old, new} to LOG so the change can be undone."""
import glob, json, os, re, sys
import numpy as np
from PIL import Image
from postfix import tidy
from inkdots import fix_dots

# Hebrew words inside a quote that the pointing rule (pointing.py) had pointed
# as Yiddish before it learned to leave quotes alone
UNPOINT = {'באַ': 'בא', 'אַז': 'אז', 'דאָ': 'דא'}


def unquote(text):
    def one(m):
        return re.sub(r'(?<![א-ת\u0591-\u05c7])(באַ|אַז|דאָ)(?![א-ת\u0591-\u05c7])', lambda w: UNPOINT[w.group(1)], m.group(0))
    return re.sub(r'„[^"„]*"', one, text)


def relabel(old, png):
    new = unquote(tidy(old))
    if '.' in new and os.path.exists(png):
        new = fix_dots(new, np.array(Image.open(png).convert('L')))
    return new


def main():
    write = '--write' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--write']
    log = open(args[0], 'a', encoding='utf-8') if write else None
    for d in args[1:]:
        n = total = 0
        for f in glob.glob(f'{d}/**/*.gt.txt', recursive=True):
            old = open(f, encoding='utf-8').read().rstrip('\n')
            new = relabel(old, f[:-7] + '.png')
            total += 1
            if new != old.strip():
                n += 1
                if write:
                    open(f, 'w', encoding='utf-8').write(new + '\n')
                    log.write(json.dumps({'gt': os.path.abspath(f), 'old': old, 'new': new}, ensure_ascii=False) + '\n')
        print(d, total, 'labels,', n, 'changed')


if __name__ == '__main__':
    main()
