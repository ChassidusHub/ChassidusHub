import sys, os, re
os.environ['OMP_THREAD_LIMIT']='1'
from concurrent.futures import ProcessPoolExecutor
import pymupdf, ocr_index as o
def head(a):
    f,p=a
    return p, o.tesseract(o.render(pymupdf.open(f),p)[:420],['-l','heb','--psm','6']).split('\n')[0][:70]
f=sys.argv[1]; n=len(pymupdf.open(f)); step=int(sys.argv[2]) if len(sys.argv)>2 else 1
with ProcessPoolExecutor(4) as ex:
    for p,h in ex.map(head,[(f,p) for p in range(0,n,step)]): print(p,h)
