"""Links each page reference of a subject index to the sicha it falls in.

A sicha starts on the page mafteiach.app gives for it and runs until the next
sicha starts, so a page belongs to the last sicha starting on or before it,
and its page inside that sicha's PDF is the distance from the start plus one.
Vols 1-4 are numbered straight through (vol 2 starts at 293), which also
tells us each of them ends where the next begins. A later volume ends where
its own indexes (מפתחות) begin, when mafteiach.app lists them; otherwise its
last sicha has no known end and pages far past its start are flagged.

    python3 link.py <index.json from run_index> <ls_anchors.json> <out.json>"""
import bisect, collections, json, sys

HEB = {'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ל': 30, 'מ': 40}
TAIL = 40  # pages a volume's last sicha may run past its start, when the volume's end is unknown


def numeral(s):
    return sum(HEB.get(c, 0) for c in s) if s else None


def build(anchors):
    by, indexes = collections.defaultdict(list), collections.defaultdict(list)
    for a in anchors:
        (indexes if a['section'] == 'מפתחות' else by)[a['volume']].append(a)
    for v in by:
        by[v].sort(key=lambda a: a['page'])
    end = {v: (by[v + 1][0]['page'] - 1 if v < 4 and v + 1 in by else
               min(a['page'] for a in indexes[v]) - 1 if indexes[v] else by[v][-1]['page'] + TAIL) for v in by}
    return by, end


def link(ref, by, end):
    v = numeral(ref['volume'])
    if v not in by:
        return None, 'no volume'
    starts = [a['page'] for a in by[v]]
    i = bisect.bisect_right(starts, ref['page']) - 1
    if i < 0:
        return None, 'before first sicha'
    if ref['page'] > end[v]:
        return None, 'past the end of the volume'
    s = by[v][i]
    return {'volume': v, 'start': s['page'], 'label': s['label'], 'section': s['section'], 'pdf': s['pdf'],
            'pdf_page': ref['page'] - s['page'] + 1}, None


if __name__ == '__main__':
    idx, anchors, out = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3]
    by, end = build(anchors)
    rows, flags = [], collections.Counter()
    for e in idx['entries']:
        for r in e['refs']:
            sicha, flag = link(r, by, end)
            if r.get('check'):
                flag = flag or 'volume letter guessed'
            flags[flag or 'linked'] += 1
            rows.append({'topic': e['topic'], **r, 'sicha': sicha, 'flag': flag})
    json.dump(rows, open(out, 'w'), ensure_ascii=False, indent=0)
    print(dict(flags))
