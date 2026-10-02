"""RebbeHub's MCP over HTTP from a script: call(tool, args) -> result. A personal
token (REBBEHUB_TOKEN, write scope) is needed for suggestions; reads go without."""
import json, os, sys, urllib.request

URL = os.environ.get('REBBEHUB_MCP', 'https://api.rebbehub.org/mcp')


def _post(body, token=None):
    hdr = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'User-Agent': 'rebbehub-ocr/1.0 (rhmcp)'}
    if token: hdr['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=hdr)
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read().decode()
    if raw.startswith('event:') or '\ndata:' in raw or raw.startswith('data:'):
        for line in raw.splitlines():
            if line.startswith('data:'):
                return json.loads(line[5:])
    return json.loads(raw)


def call(tool, args, token=None):
    body = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': tool, 'arguments': args}}
    r = _post(body, token or os.environ.get('REBBEHUB_TOKEN'))
    if 'error' in r:
        raise RuntimeError(r['error'])
    res = r['result']
    if res.get('isError'):
        raise RuntimeError(res.get('content'))
    text = ''.join(c.get('text', '') for c in res.get('content', []) if c.get('type') == 'text')
    try:
        return json.loads(text)
    except Exception:
        return text


if __name__ == '__main__':
    print(json.dumps(call(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}), ensure_ascii=False)[:800])
