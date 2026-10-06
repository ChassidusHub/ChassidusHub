"""Give a PP-OCRv6 line model a new input line height. The backbone averages
over the whole feature height, so the weights of a 96 px model read lines
at 128 px unchanged (and a little better: ב and כ get a third more pixels);
training then continues from them at the new height instead of starting
over. Kraken takes the height from the model's own metadata and ignores
--height when a model is loaded, so the metadata is what changes here.

    setheight.py <in.safetensors> <out.safetensors> <height>"""
import json, sys
from safetensors import safe_open
from safetensors.torch import save_file

src, dst, h = sys.argv[1], sys.argv[2], int(sys.argv[3])
f = safe_open(src, 'pt')
meta = dict(f.metadata()); tensors = {k: f.get_tensor(k) for k in f.keys()}
km = json.loads(meta['kraken_meta'])
for k in km:
    print(k, 'height', km[k].get('height'), '->', h); km[k]['height'] = h
meta['kraken_meta'] = json.dumps(km)
save_file(tensors, dst, metadata=meta)
