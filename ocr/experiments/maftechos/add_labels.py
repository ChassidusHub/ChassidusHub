"""add_labels.py <sheet no> then one label per line on stdin (in sheet order)."""
import json, sys
sheets = json.load(open('sheets.json'))
s = int(sys.argv[1])
labels = [l.rstrip('\n') for l in sys.stdin if l.strip()]
lines = sheets[s]['lines']
assert len(labels) == len(lines), (len(labels), len(lines))
try: store = json.load(open('labels.json'))
except FileNotFoundError: store = {}
for l, t in zip(lines, labels):
    store[l['name']] = {'text': t, 'hard': l['hard'], 'kraken': l['kraken']}
json.dump(store, open('labels.json', 'w'), ensure_ascii=False, indent=0)
print(len(store), 'labelled')
