"""Read a page's lines with a Kraken model: the first pass that silver
pairs are built from, and later the trained model's output."""
import sys
import numpy as np
from PIL import Image
from kraken.configs import RecognitionInferenceConfig
from kraken.containers import Segmentation, BBoxLine
from kraken.tasks import RecognitionTaskModel
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from layout import deskew, page_layout

PAD = 6


CONFIG = RecognitionInferenceConfig(text_direction='horizontal-rl', num_line_workers=0)


def load(path):
    return RecognitionTaskModel.load_model(path)


def read_page(net, a):
    """The page's layout with 'text' filled in on every line."""
    lay = page_layout(a)
    # The running head too, read on every page: it can change within a sicha.
    lines = [l for key in ('body', 'notes') for col in lay[key] for l in col] + [lay['head']]
    h, w = a.shape
    seg = Segmentation(type='bbox', imagename='page', text_direction='horizontal-rl', script_detection=False,
                       lines=[BBoxLine(id=str(i), bbox=(max(0, l['x0'] - PAD), max(0, l['y0'] - PAD), min(w, l['x1'] + PAD), min(h, l['y1'] + PAD)), text_direction='horizontal-rl')
                              for i, l in enumerate(lines)])
    for l, rec in zip(lines, net.predict(Image.fromarray(a), seg, CONFIG)):
        l['text'] = rec.prediction.strip()
        l['words'] = words(rec, l)
    return lay


def words(rec, line):
    """Each word of a read line with its place on the page (x0, x1 across the line's
    height) and how sure the model was of it (its least sure letter), for showing a word
    on the scan, highlighting a search hit, and sending doubtful words to be checked."""
    pred, cuts, conf = rec.prediction, rec.cuts, rec.confidences
    if not pred or len(cuts) != len(pred):
        return []
    xs = [sum(p[0] for p in c) / len(c) for c in cuts]
    half = (line['x1'] - line['x0']) / max(1, len(pred)) / 2
    out, cur = [], []
    for i, ch in enumerate(pred + ' '):
        if ch == ' ' or i == len(pred):
            if cur:
                out.append({'text': ''.join(pred[j] for j in cur),
                            'x0': int(max(line['x0'], min(xs[j] for j in cur) - half)),
                            'x1': int(min(line['x1'], max(xs[j] for j in cur) + half)),
                            'conf': round(float(min(conf[j] for j in cur)), 3)})
            cur = []
        else:
            cur.append(i)
    return out


if __name__ == '__main__':
    import time
    net = load(sys.argv[1])
    for f in sys.argv[2:]:
        t = time.time()
        lay = read_page(net, deskew(np.array(Image.open(f).convert('L'))))
        print(f, round(time.time() - t, 1), 's')
        for key in ('body', 'notes'):
            for col in lay[key]:
                for l in col[:4]:
                    print(key, l['text'])
