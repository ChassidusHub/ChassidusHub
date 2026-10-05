"""How Likkutei Sichos points its Yiddish, from the typed text of vols 30-39.

The readers drop the point under a Yiddish alef far more than they make one up
(on vols 15-25 they read נאך bare 1,856 times and נאָך 448; the typed text has
נאָך 374 times and נאך 13; the scans show the kamatz), and the dagesh in פּ the
same way. Training labels taken from the readers' own readings taught that,
until the round 3 reader wrote נאך and פסוק bare where the print has נאָך and
פּסוק (checked on the vol 15 and vol 39 scans, 2026-10-04). So a label's
pointing comes from the typed text, which people typed from the print: a bare
word is written as its pointed form when the typed Yiddish lines have the
pointed form at least three times as often (ten times or more in all).

    pointing.py <typed lines or pairs dir>...   prints the rule
    from pointing import fix; fix('נאך איז דאך א פסוק') -> 'נאָך איז דאָך אַ פסוק'

A one-letter word keeps its spelling when punctuation is attached ("א." is a
section letter, not the article אַ), and so does a two-letter one before a
bracket ("בא):" numbers a section). Words the typed text points two ways
(אַן / אָן) are left as read, and so is the dagesh in a Hebrew word (פסוק): vol 39
prints פּסוק, vols 15-25 mostly פסוק (scans checked 2026-10-04), and the readers
read the dagesh in Yiddish words (אָפּ, אַראָפּ) well.

A quote („...") is Hebrew or Aramaic more often than not ("רשע בא לעולם", "דא
בדא"), so words inside one keep the reader's spelling. A rule entry that would
add anything but points is dropped: the rule built before the maqaf fix had
גע -> גע־, which doubled the maqaf at the end of 777 Yiddish labels
(Shmuly's 922 checks, 2026-10-05)."""
import collections, glob, json, os, re, sys

POINTS = re.compile('[\u0591-\u05bd\u05bf-\u05c7]')  # the points, not the maqaf (U+05BE) between them
YID = re.compile('[ַָֿ]|(^| )(און|איז|ניט|דער|דאָס|וואָס|אַז|נישט|זיך|זיין|מיט|פון|אויף|ווי|אויך)( |$)')
HERE = os.path.dirname(os.path.abspath(__file__))
RULE = HERE + '/../../../lsdata/pointing.json' if os.path.isdir(HERE + '/../../../lsdata') else '/home/user/lsdata/pointing.json'
_rule = None
# bare words that are Hebrew as often as Yiddish: האב is "the father" in "על האב"
# (4 of the 27 bare words on Shmuly's alef sheet, 2026-10-05)
HEBREW_TOO = {'האב'}


def core(w):
    """The word without the punctuation around it (geresh and gershayim stay)."""
    return re.sub(r'^[^א-ת]+|[^א-ת\u0591-\u05bd\u05bf-\u05c7\'"]+$', '', w)


def build(sources):
    """{bare: pointed} from typed Yiddish lines (files of 'kind<tab>width<tab>text'
    or a directory of *.gt.txt labels)."""
    forms = collections.defaultdict(collections.Counter)
    for src in sources:
        files = glob.glob(f'{src}/**/*.gt.txt', recursive=True) if os.path.isdir(src) else [src]
        for f in files:
            for line in open(f, encoding='utf-8'):
                t = line.split('\t')[-1].strip()
                if not YID.search(t):
                    continue
                for w in t.split():
                    c = core(w)
                    if c:
                        forms[POINTS.sub('', c)][c] += 1
    rule = {}
    for bare, c in forms.items():
        (top, n), *rest = c.most_common()
        if top == bare or sum(c.values()) < 10:
            continue
        others = sum(c.values()) - n
        if n >= 3 * max(others, 1) and top.replace('\u05bc', '') != bare:
            rule[bare] = top
    return rule


def load():
    global _rule
    if _rule is None:
        _rule = {k: v for k, v in json.load(open(RULE, encoding='utf-8')).items() if POINTS.sub('', v) == k and k not in HEBREW_TOO}
    return _rule


def fix(text):
    """The line with each bare word the print points written pointed."""
    rule = load()
    out = []
    quoted = False
    for w in text.split(' '):
        if w.startswith('„') or re.match(r'^[^א-ת]*„', w):
            quoted = True
        c = core(w)
        bare = POINTS.sub('', c)
        if not quoted and c and bare in rule and c != rule[bare] and not (len(bare) == 1 and c != w) and not (len(bare) <= 2 and re.search(r'\)[:.,;]?$', w)):
            w = w.replace(c, rule[bare], 1)
        if quoted and re.search(r'[א-ת\u0591-\u05c7\']"[^א-ת]*$', w):
            quoted = False
        out.append(w)
    return ' '.join(out)


if __name__ == '__main__':
    rule = build(sys.argv[1:])
    json.dump(rule, open(RULE, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(len(rule), 'words pointed by rule ->', RULE)
