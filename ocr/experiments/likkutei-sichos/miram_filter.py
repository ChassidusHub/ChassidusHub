"""Keeps only the harvested Miram letters whose shape is closer to Miram's
outline than to Frank's (light.looks_miram), before the font is built.

    python3 miram_filter.py <letters.pkl> <out.pkl> <Miram.ttf> <Frank.ttf>"""
import pickle, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from light import looks_miram

if __name__ == '__main__':
    store = pickle.load(open(sys.argv[1], 'rb'))
    out = {}
    for k, v in store.items():
        if k.startswith('_') or ':' not in k:
            out[k] = v
            continue
        ch = k.split(':', 1)[1]
        kept = [r for r in v if looks_miram(ch, r, sys.argv[3], sys.argv[4])[0]] if 'א' <= ch <= 'ת' else v
        out[k] = kept
        print(k, len(v), '->', len(kept), flush=True)
    pickle.dump(out, open(sys.argv[2], 'wb'))
