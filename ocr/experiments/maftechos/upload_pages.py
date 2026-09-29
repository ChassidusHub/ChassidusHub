"""Uploads the index pages as one suggestion through RebbeHub's API (the same
routes the MCP's suggest_items calls) and sends it for review; a person
approves it on the site. Few, large requests, to spare the database.
    REBBEHUB_TOKEN=rhp_... python3 upload_pages.py pages.json [--dry-run]"""
import json, os, sys, time, urllib.request

API = 'https://api.rebbehub.org'
TOKEN = os.environ.get('REBBEHUB_TOKEN', '')
LS = 'rh-t3aehxx4'  # לקוטי שיחות, for its sets and authors


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


pages = json.load(open(sys.argv[1]))['units']
ls = call('GET', f'/v1/entities/{LS}')['data']
work = {'title': {'he': 'מפתח ענינים ללקוטי שיחות', 'en': 'Likkutei Sichos: subject index'}, 'slug': 'likkutei-sichos-mafteach-inyanim',
        'authors': ls.get('authors', []), 'genre': 'sichos', 'levels': ['volume'], 'sets': ls.get('sets', []),
        'description': {'he': 'מפתח הענינים של כל חלק, כל מספר עמוד קישור לעמוד בקובץ השיחה. חלקים א-כה ול"ז נקראו במכונה ולא נבדקו עדיין; ל-ל"ט כפי שהוקלדו בספריית חב"ד.',
                        'en': "Each volume's subject index, every page number a link to that page of the sicha's PDF. Vols 1-25 and 37 were read by machine and are not yet checked; 30-39 as typed by the Chabad Library."}}
if '--dry-run' in sys.argv:
    print(json.dumps(work, ensure_ascii=False)[:500]); sys.exit()
s = call('POST', '/v1/suggestions', {'title': 'מפתח ענינים ללקוטי שיחות (חלקים א-כה, ל-לט)', 'description': "The subject indexes as pages, each page number linked to its sicha's PDF page (RebbeHub-OCR experiments/maftechos)."})['id']
wid = call('PUT', f'/v1/suggestions/{s}/items', {'type': 'work', 'data': work, 'path': '/likkutei-sichos-mafteach-inyanim'})['id']
for u in pages:
    unit = {'work': wid, 'position': [{'level': 'volume', 'value': str(u['volume'])}], 'order': f"{u['volume']:02d}V", 'label': u['label'], 'body': u['body']}
    call('PUT', f'/v1/suggestions/{s}/items', {'type': 'unit', 'data': unit, 'path': f"/likkutei-sichos-mafteach-inyanim/{u['volume']}"})
    print('put', u['volume'], flush=True)
    time.sleep(1)
sent = call('POST', f'/v1/suggestions/{s}/submit')
print('submitted', sent.get('status'), [c for c in sent.get('checks', []) if c.get('status') == 'fail'])
print(f'https://rebbehub.org/review?s={s}')
