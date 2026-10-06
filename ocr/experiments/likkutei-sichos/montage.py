import sys
from PIL import Image
out, fs = sys.argv[1], sys.argv[2:]
ims = [Image.open(f) for f in fs]; ims = [i.resize((600, int(i.height * 600 / i.width))) for i in ims]
m = Image.new('RGB', (600 * len(ims), max(i.height for i in ims)), 'white')
for k, i in enumerate(ims): m.paste(i, (600 * k, 0))
m.save(out)
