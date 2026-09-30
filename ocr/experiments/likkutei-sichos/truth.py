"""The Chabad Library's typed text of Likkutei Sichos vols 30-39, a file per
printed page: truth/<vol>_<page>.json {'body': str, 'notes': {marker: str}}.
The body keeps its paragraphs (one per line) and a footnote's place as
[[marker]]; soft hyphens stay, since they mark where the print broke a word."""
import html, json, os, re, sys

LIB = '/mnt/project-files/chabadlibrary'
LETTERS = {c: v for c, v in zip('אבגדהוזחטיכלמנסעפצקרשת', [1,2,3,4,5,6,7,8,9,10,20,30,40,50,60,70,80,90,100,200,300,400])}


def numeral(s):
    s = re.sub('[׳״\'"]', '', s)
    return sum(LETTERS.get(c, 0) for c in s) if s and all(c in LETTERS for c in s) else None


def clean(text):
    text = re.sub(r'\[ftnref_\d+_(\*?\d+)\]', r'[[\1]]', text)
    text = re.sub(r'<h\d[^>]*>(.*?)</h\d>', r'\1\n', text, flags=re.S)
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', html.unescape(text))
    return '\n'.join(re.sub(r'[ \t]+', ' ', l).strip() for l in text.replace('\r', '').split('\n') if l.strip())


def notes(haoros):
    out = {}
    for m in re.finditer(r'\[ftn_\d+_(\*?\d+)\]\)?\s*(.*?)(?=\[ftn_\d+_|\Z)', html.unescape(haoros or ''), re.S):
        out[m.group(1)] = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', m.group(2))).strip()
    return out


if __name__ == '__main__':
    tree = json.load(open(f'{LIB}/tree.json'))['nodes']
    os.makedirs('truth', exist_ok=True)
    n = 0
    for line in open(f'{LIB}/texts/1300000000.jsonl'):
        e = json.loads(line)
        chain, x = [], str(e['id'])
        while x in tree:
            chain.append(tree[x]['heading']); x = str(tree[x]['parent'])
        vol = next((numeral(h.split()[1]) for h in chain if re.match(r'^(כרך|חלק) \S+$', h)), None)
        if not vol or any('מפתח' in h for h in chain) or not e['heading'].isdigit():
            continue
        path = f'truth/{vol}_{int(e["heading"]):04d}.json'
        rec = {'id': e['id'], 'section': chain[1:-2], 'body': clean(e['text'] or ''), 'notes': notes(e.get('haoros'))}
        if os.path.exists(path):  # a page the library gives twice: keep both
            old = json.load(open(path)); rec['body'] = old['body'] + '\n' + rec['body']; rec['notes'] = {**old['notes'], **rec['notes']}
        json.dump(rec, open(path, 'w'), ensure_ascii=False)
        n += 1
    print(n, 'pages')
