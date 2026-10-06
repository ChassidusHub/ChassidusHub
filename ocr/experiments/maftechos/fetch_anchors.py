"""Every Likkutei Sichos sicha's volume and start page, with its section
(parsha or moed) and the link to its PDF, from mafteiach.app's by-volume
pages. One request a second.
    python3 fetch_anchors.py <out.json>"""
import json, re, subprocess, sys, time
from bs4 import BeautifulSoup

out = []
for vol in range(1, 40):
    html = subprocess.run(['curl', '-sS', '-m', '60', f'https://www.mafteiach.app/likkutei_sichos/by_volume/{vol}'],
                          capture_output=True).stdout.decode('utf-8', 'replace')
    soup = BeautifulSoup(html, 'html.parser')
    n = 0
    for section in soup.select('div.parsha'):
        head = section.find('button')
        for s in head.find_all('span'):
            s.decompose()
        section_label = ' '.join(head.get_text().split())
        for b in section.select('button.likkut-sicha-button'):
            m = re.match(r'likkut_sicha_(\d+)_(\d+)__button$', b.get('id', ''))
            if not m:
                continue
            content = soup.find(id=f'likkut_sicha_{m[1]}_{m[2]}__content')
            links = {' '.join(a.get_text().split()): a['href'] for a in content.select('.button-row a[href]')} if content else {}
            out.append({'volume': int(m[1]), 'page': int(m[2]), 'label': ' '.join(b.get_text().split()),
                        'section': section_label, 'pdf': links.get('שיחה')})
            n += 1
    print(vol, n, flush=True)
    time.sleep(1)
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=0)
