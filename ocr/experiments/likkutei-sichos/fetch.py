"""Download the scans of Likkutei Sichos vols 30-39, a PDF per sicha
(pdf/<vol>_<start page>.pdf), from the Google Drive links in
Sichos-Kodesh's list (made from mafteiach.app). Scans stay out of git.

    python3 fetch.py <Sichos-Kodesh checkout> [first vol] [last vol]"""
import json, os, subprocess, sys, time

src, first, last = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 30, int(sys.argv[3]) if len(sys.argv) > 3 else 39
items = json.load(open(f'{src}/apps/mobile/src/catalog/data/library/likkuteiSichos.json'))['items']
os.makedirs('pdf', exist_ok=True)
for i in items:
    if not first <= i['volume'] <= last or i.get('supplement'):
        continue
    ref = next((r for r in i['refs'] if r['kind'] == 'pdf' and r['role'] == 'sicha'), None)
    if not ref:
        continue
    f = f"pdf/{i['volume']}_{i['page']:04d}.pdf"
    if os.path.exists(f) and os.path.getsize(f) > 5000:
        continue
    for attempt in range(3):
        subprocess.run(['curl', '-sSL', '-m', '120', '-A', 'Mozilla/5.0', f"https://drive.google.com/uc?export=download&id={ref['sourceId']}", '-o', f])
        if os.path.exists(f) and open(f, 'rb').read(5) == b'%PDF-':
            break
        time.sleep(3)
    else:
        print('FAIL', f, flush=True)
    time.sleep(0.5)
print('ALLDONE', flush=True)
