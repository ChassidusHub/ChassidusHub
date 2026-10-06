"""Draw a page's layout: body lines red, footnote lines blue."""
import sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from layout import deskew, page_layout

def show(src, dst):
    a = deskew(np.array(Image.open(src).convert('L')))
    lay = page_layout(a)
    im = Image.fromarray(a).convert('RGB'); d = ImageDraw.Draw(im)
    for key, colour in (('body', 'red'), ('notes', 'blue')):
        for col in lay[key]:
            for l in col:
                d.rectangle([l['x0'], l['y0'], l['x1'], l['y1']], outline=colour, width=3)
    im.save(dst)
    return [len(c) for c in lay['body']], [len(c) for c in lay['notes']]

if __name__ == '__main__':
    for src in sys.argv[1:]:
        print(src, show(src, src.replace('.png', '_lay.png')))
