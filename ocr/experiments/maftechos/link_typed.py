"""Links a volume's subject index, as typed by the Chabad Library, to its sichos.

These indexes are typed by people, so they need no OCR; each page reference
is a [mafteach_gopage file="ls34" gopage="271"] mark in the entry's text
(vols 30-34) or a link whose text is the page (vols 35 on). From vol 35 the
link also names the library's own sicha; where most of our sicha's references
name a different one, the reference is flagged. Mostly this is the additions
(הוספות), where mafteiach.app keeps several talks and letters in one PDF and
the library splits them: the PDF page is still right, the label is coarser.
    python3 link_typed.py <truth{v}.json> <volume> <ls_anchors.json> <out.json>"""
import collections, json, re, sys
from link import build, link
from ocr_index import hebrew_numeral as hebrew

if __name__ == '__main__':
    entries, v, anchors, out = json.load(open(sys.argv[1])), int(sys.argv[2]), json.load(open(sys.argv[3])), sys.argv[4]
    by, end = build(anchors)
    rows, flags = [], collections.Counter()
    library = collections.defaultdict(collections.Counter)  # our sicha start -> the library's sichos in it
    for e in entries:
        for sec, p in re.findall(r'lkus/\d+/(\d+/\d+)/(\d+)\.aspx', e['text']):
            s, _ = link({'volume': hebrew(v), 'page': int(p)}, by, end)
            if s:
                library[s['start']][sec] += 1
    for e in entries:
        text = re.sub(r'page marker.*', '', e['text'])  # a stray timestamp in the library's text
        for m in re.finditer(r'(?:gopage="(\d+)"\]|<a [^>]*>(\d+)</a>)\s*([^\[<]*)', text):
            ref = {'volume': hebrew(v), 'page': int(m.group(1) or m.group(2)), 'to': int(m.group(1) or m.group(2)), 'note': m.group(3).strip(' .;')}
            sicha, flag = link(ref, by, end)
            sec = re.search(r'lkus/\d+/(\d+/\d+)/\d+\.aspx', m.group(0))
            if sicha and sec and library[sicha['start']].most_common(1)[0][0] != sec.group(1):
                flag = 'library splits this sicha further'
            flags[flag or 'linked'] += 1
            rows.append({'topic': e['topic'], **ref, 'sicha': sicha, 'flag': flag, 'source': 'Chabad Library typed index'})
    json.dump(rows, open(out, 'w'), ensure_ascii=False, indent=0)
    print(v, dict(flags))
