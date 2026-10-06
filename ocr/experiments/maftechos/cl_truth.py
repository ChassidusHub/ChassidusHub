"""
Fetches the Chabad Library's typed copy of one subject index: every topic
page under the index's root node, as [{letter, topic, id, text}]. Polite:
one request at a time, half a second apart.

    python3 cl_truth.py <index root id> <out.json>
"""
import json,subprocess,time,sys
def get(i):
    for a in range(4):
        r=subprocess.run(['curl','-sS','--compressed','-m','30','-A','ChassidusHubIndex/0.1',f'https://chabadlibrary.org/books/api/main?path=/{i}'],capture_output=True)
        time.sleep(0.5)
        try: return json.loads(r.stdout.decode('utf-8','replace'))['content']
        except Exception: time.sleep(2)
root=int(sys.argv[1]); out=[]
letters=get(root)['data']
for L in letters:
    for t in get(L['id'])['data']:
        c=get(t['id'])
        out.append({'letter':L['heading'].strip(),'topic':t['heading'],'id':t['id'],'text':c['data']['text'] if c['type']=='page' else None})
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
print(len(out))
