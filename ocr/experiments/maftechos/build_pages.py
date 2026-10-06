"""Turns the linked subject indexes into RebbeHub pages: one unit per volume
of a work "מפתח ענינים ללקוטי שיחות", each page's words its index, every page
number a link that opens that sicha's PDF at the page. Refs a person must
check (flagged) stay as plain numbers.
    python3 build_pages.py <out.json>   -> {units: [{volume, label, body, refs, flagged}]}"""
import json, sys, urllib.parse, collections
from ocr_index import hebrew_numeral

OCR = {'origin': {'by': 'ocr:kraken-maftechos-r4'}}
SOURCES = [('linked1_9e.json', 'ocr', 'לקוטי שיחות - מפתחות (א-ט)'), ('linked10_14.json', 'ocr', 'לקוטי שיחות - מפתחות (י-טו)'),
           ('linked15_19.json', 'ocr', 'לקוטי שיחות - מפתחות (טו-יט)'), ('linked20_24.json', 'ocr', 'לקוטי שיחות - מפתחות (כ-כד)'),
           ('linked25.json', 'ocr', 'לקוטי שיחות - מפתחות (כה)'), ('linked37.json', 'ocr', 'לקוטי שיחות - מפתחות (לז)')] + \
          [(f'linked30/ls{v}.json', 'typed', None) for v in (30, 31, 32, 33, 34, 35, 36, 38, 39)]
NUM = {hebrew_numeral(n): n for n in range(1, 40)}


UNLINKED = {'past the end of the volume', 'no volume', 'before first sicha', 'volume letter guessed'}
bad = lambda r: not r['sicha'] or r['flag'] in UNLINKED


def href(s, page):
    # Short on purpose: 33,000 of these fill the pages. The title stays readable Hebrew
    # (spaces as +), and src goes last, unencoded, since a Drive link holds no & of its own.
    title = ''.join({'&': '%26', '#': '%23', '%': '%25', '+': '%2B', '?': '%3F'}.get(c, c) for c in s['label']).replace(' ', '+')
    page = f"page={s['pdf_page']}&" if s['pdf_page'] > 1 else ''
    return f"/read?{page}title={title}&src={s['pdf']}"


def runs_for(refs):
    out = []
    for i, r in enumerate(refs):
        page = f"{r['page']}" + (f"-{r['to']}" if r['to'] != r['page'] else '')
        if out:
            out.append({'text': ' '})
        out.append({'text': page, **({'href': href(r['sicha'], r['page'])} if not bad(r) else {})})
        if r['note']:
            out.append({'text': f" ({r['note'].strip('()')})" if not r['note'].startswith('(') else f" {r['note']}"})
        out.append({'text': '.'})
    return out


volumes = collections.defaultdict(lambda: {'topics': collections.OrderedDict(), 'kind': None, 'book': None})
for f, kind, book in SOURCES:
    for r in json.load(open(f)):
        v = NUM.get(r['volume'])
        if v is None:
            v = ('?', f)  # no volume letter: kept aside for a person
        if v in volumes and volumes[v]['kind'] and volumes[v]['book'] != book:
            continue
        d = volumes[v]
        d['kind'], d['book'] = kind, book
        d['topics'].setdefault(r['topic'] or '(המשך)', []).append(r)

units = []
for v, d in sorted(((k, x) for k, x in volumes.items() if isinstance(k, int))):
    segments, n, flagged, total = [], 0, 0, 0
    for t, refs in d['topics'].items():
        n += 1
        segments.append({'id': f't{n}', 'kind': 'heading', 'level': 2, 'text': [{'text': t}]})
        segments.append({'id': f't{n}.1', 'kind': 'paragraph', 'text': runs_for(refs)})
        total += len(refs)
        flagged += sum(1 for r in refs if bad(r))
    version = {'id': 'he', 'language': 'he', 'segments': segments}
    if d['kind'] == 'ocr':
        version.update(OCR)
        version['title'] = f"נקרא במכונה מתוך {d['book']} (אוצרות הרבי), לא נבדק עדיין"
    else:
        version['title'] = 'מפתח ענינים כפי שהוקלד בספריית חב"ד'
        version['credit'] = 'ספריית חב"ד (chabadlibrary.org)'
        version['url'] = 'https://chabadlibrary.org'
    units.append({'volume': v, 'label': {'he': f'חלק {hebrew_numeral(v)}', 'en': f'Volume {v}'}, 'kind': d['kind'],
                  'body': {'profile': 'plain', 'versions': [version]}, 'refs': total, 'flagged': flagged})
json.dump({'units': units}, open(sys.argv[1], 'w'), ensure_ascii=False)
for u in units:
    print(u['volume'], u['kind'], u['refs'], u['flagged'], len(json.dumps(u['body'], ensure_ascii=False)) // 1024, 'KB')
print('no volume:', sum(len(r) for k, x in volumes.items() if not isinstance(k, int) for r in x['topics'].values()))
