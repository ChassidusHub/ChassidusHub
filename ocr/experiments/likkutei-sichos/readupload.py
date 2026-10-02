"""A read sicha onto RebbeHub: the unit at /likkutei-sichos/<vol>/<start page>
gets the page text as its words, every segment and note marked as the
machine's (origin), so the site labels it until a person checks it. Sent as
one suggestion over the REST API with a personal token (REBBEHUB_TOKEN, write
scope), the same calls the MCP's suggest_items makes.

    readupload.py <sicha.json>... [--dry] [--batch N] [--title T]

--dry writes <sicha>.item.json beside each file and sends nothing."""
import json, os, re, sys, urllib.request

API = os.environ.get('REBBEHUB_API', 'https://api.rebbehub.org')
BY = os.environ.get('READ_BY', 'ocr:rebbehub-ls-focus-1217+facenet2-v2')
KINDS = {'section', 'heading', 'paragraph', 'verse', 'item', 'note'}


def req(method, path, body=None, token=None):
    hdr = {'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'rebbehub-ocr/1.0 (readupload)'}
    if token: hdr['Authorization'] = f'Bearer {token}'
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, headers=hdr, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode() or 'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or 'null')


def machine(seg):
    """The segment with the machine's origin on it and on its children; a dateline
    (assemble's 'date') is a paragraph set to the line's end, as RebbeHub prints dates."""
    seg = dict(seg)
    if seg.get('kind') == 'date':
        seg['kind'] = 'paragraph'; seg['end'] = True
    if seg.get('kind') not in KINDS:
        seg['kind'] = 'paragraph'
    seg['origin'] = {'by': BY}
    if seg.get('children'):
        seg['children'] = [machine(c) for c in seg['children']]
    return seg


def body_of(read):
    pt = json.loads(json.dumps(read['pageText']))
    for v in pt['versions']:
        v['segments'] = [machine(s) for s in v['segments']]
        v['notes'] = [machine(n) for n in v.get('notes', [])]
        v['origin'] = {'by': BY}
        v.setdefault('language', 'he')
    return pt


def unit_path(stem):
    vol, start = stem.split('_')
    return f'/likkutei-sichos/{int(vol)}/{int(start)}'


def item_for(read, live):
    data = dict(live.get('data') or {})
    data['body'] = body_of(read)
    return {'type': live['type'], 'id': live['id'], 'data': data}


if __name__ == '__main__':
    args = sys.argv[1:]
    dry = '--dry' in args; args = [a for a in args if a != '--dry']
    batch = 50; title = None
    if '--batch' in args:
        k = args.index('--batch'); batch = int(args[k + 1]); del args[k:k + 2]
    if '--title' in args:
        k = args.index('--title'); title = args[k + 1]; del args[k:k + 2]
    token = os.environ.get('REBBEHUB_TOKEN')
    if not dry and not token:
        sys.exit('REBBEHUB_TOKEN (write scope) is needed to send; --dry to only build')
    items = []
    for f in args:
        read = json.load(open(f, encoding='utf-8'))
        path = unit_path(read['sicha'])
        st, r = req('GET', f'/v1/resolve?path={urllib.request.quote(path)}')
        if st == 200 and r.get('id'):
            st, live = req('GET', f'/v1/entities/{r["id"]}')
        if st != 200:
            print(f'{read["sicha"]}: no unit at {path} ({st})', flush=True); continue
        item = item_for(read, live)
        if dry:
            out = f[:-5] + '.item.json'
            json.dump(item, open(out, 'w'), ensure_ascii=False)
            v = item['data']['body']['versions'][0]
            print(f'{read["sicha"]} -> {live["id"]} {path}: {len(v["segments"])} segments, {len(v["notes"])} notes, {os.path.getsize(out) // 1024} KB', flush=True)
        items.append(item)
    if dry or not items:
        sys.exit(0)
    for i in range(0, len(items), batch):
        chunk = items[i:i + batch]
        st, s = req('POST', '/v1/suggestions', {'title': title or f'Likkutei Sichos: machine reading of {len(chunk)} sichos', 'description': 'Read from the sicha scans by the LS OCR (RebbeHub-OCR, PR #9): paragraphs with linked footnotes, printed pages, Miram as bold. Machine output, labelled until checked.'}, token)
        if st >= 400: sys.exit(f'suggestion: {st} {s}')
        sid = s['id']
        for it in chunk:
            st, a = req('PUT', f'/v1/suggestions/{sid}/items', it, token)
            if st >= 400: sys.exit(f'item {it["id"]}: {st} {a} (suggestion {sid} keeps the ones before)')
        st, sent = req('POST', f'/v1/suggestions/{sid}/submit', None, token)
        print(f'suggestion {sid}: {sent.get("status") if isinstance(sent, dict) else st}, {len(chunk)} sichos', flush=True)
