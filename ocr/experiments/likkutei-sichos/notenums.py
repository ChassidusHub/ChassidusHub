"""Training labels whose note lost its number: 1,058 typed notes of vols 30-38
open with a bare ")" though the scan prints "8)" (the Chabad Library text drops
the number at the head of a note). The reader learned to drop it too (17 of
Shmuly's 922 checks, 2026-10-05). Each such label gets its number back when two
witnesses agree: the page's own sequence of notes (the note before plus one, or
the note after minus one) and the reader's reading of the label alone
(recog.note_label, five widths). A star note ("*42)") or a disagreement is left
for a person.

python3 notenums.py MODEL PAIRS_DIR [--write] [--left]
Prints counts; --write rewrites the .gt.txt files and lists them in
PAIRS_DIR/notenums.jsonl (old label, new label, both witnesses); --left lists the rest in
PAIRS_DIR/notenums_left.jsonl."""
import collections, glob, json, re, sys
import numpy as np
from PIL import Image
import recog


def candidates(pairs):
    """{gt file: number the page's sequence says} for the bare note openings."""
    pages = collections.defaultdict(list)
    for f in glob.glob(f'{pairs}/3[0-9]/*_n[0-9]*.gt.txt'):
        m = re.search(r'/(\d+_\d+)_n(\d+)\.gt\.txt$', f)
        pages[m.group(1)].append((int(m.group(2)), f))
    out = {}
    for lines in pages.values():
        seq = []
        for _, f in sorted(lines):
            t = open(f, encoding='utf-8').read().strip()
            m = re.match(r'^(\d{1,3})\)', t)
            if m:
                seq.append((f, int(m.group(1))))
            elif t.startswith(')'):
                seq.append((f, None))
        for i, (f, k) in enumerate(seq):
            if k is not None:
                continue
            prev = next(((j, seq[j][1]) for j in range(i - 1, -1, -1) if seq[j][1] is not None), None)
            nxt = next(((j, seq[j][1]) for j in range(i + 1, len(seq)) if seq[j][1] is not None), None)
            c = {x for x in (prev and prev[1] + i - prev[0], nxt and nxt[1] - (nxt[0] - i)) if x}
            out[f] = c.pop() if len(c) == 1 else None
    return out


def main():
    net = recog.load(sys.argv[1])
    write = '--write' in sys.argv
    cand = candidates(sys.argv[2])
    n = collections.Counter()
    log = open(f'{sys.argv[2]}/notenums.jsonl', 'a') if write else None
    dump = open(f'{sys.argv[2]}/notenums_left.jsonl', 'w') if '--left' in sys.argv else None
    for f, seq in sorted(cand.items()):
        text = open(f, encoding='utf-8').read().strip()
        a = np.array(Image.open(f[:-7] + '.png').convert('L'))
        line = {'text': text, 'y0': 0, 'y1': a.shape[0], 'x1': a.shape[1]}
        recog.note_label(net, a, line)
        read = line.get('label_from_crop')
        if read and seq and read == str(seq):
            n['agree'] += 1
            if write:
                open(f, 'w', encoding='utf-8').write(read + text + '\n')
                log.write(json.dumps({'gt': f, 'old': text, 'new': read + text, 'seq': seq, 'read': read}, ensure_ascii=False) + '\n')
        else:
            kind = 'star' if read and '*' in read else 'disagree' if read and seq else 'one witness'
            n[kind] += 1
            if dump:
                dump.write(json.dumps({'gt': f, 'text': text, 'seq': seq, 'read': read, 'kind': kind}, ensure_ascii=False) + '\n')
    print(dict(n))


if __name__ == '__main__':
    main()
