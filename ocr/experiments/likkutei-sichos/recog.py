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
    lines = [l for key in ('body', 'notes') for col in lay[key] for l in col]
    h, w = a.shape
    seg = Segmentation(type='bbox', imagename='page', text_direction='horizontal-rl', script_detection=False,
                       lines=[BBoxLine(id=str(i), bbox=(max(0, l['x0'] - PAD), max(0, l['y0'] - PAD), min(w, l['x1'] + PAD), min(h, l['y1'] + PAD)), text_direction='horizontal-rl')
                              for i, l in enumerate(lines)])
    for l, rec in zip(lines, net.predict(Image.fromarray(a), seg, CONFIG)):
        l['text'] = rec.prediction.strip()
    return lay


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
