#!/usr/bin/env python3
"""라이브러리 목록용 가벼운 미리보기(PNG)를 만든다. 원본 SVG 는 읽기만 한다. → assets/thumbs/<assetId>.png, catalog 에 thumb 경로 기록"""
import json,os,sys
from playwright.sync_api import sync_playwright
R=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))+'/'
j=json.load(open(R+'catalog/assets.json',encoding='utf-8'));A=j['assets']
os.makedirs(R+'assets/thumbs',exist_ok=True)
CW,CH=200,160;BATCH=40
def pick(a):
    for k in('front','rightSide','leftSide'):
        v=a['views'].get(k)
        if v:return v
    return None
ONLY=set(sys.argv[1:])  # 인자로 assetId 를 주면 그 에셋 것만 만든다
todo=[(a,pick(a)) for a in A if pick(a) and (not ONLY or a['assetId'] in ONLY)]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium');pg=b.new_page(viewport={'width':CW*5+20,'height':CH*8+20},device_scale_factor=1.5)
    for s in range(0,len(todo),BATCH):
        part=todo[s:s+BATCH]
        h='<body style="margin:0;background:transparent"><div style="display:grid;grid-template-columns:repeat(5,%dpx)">'%CW
        for a,v in part:
            h+=f'<div id="c{a["assetId"]}" style="width:{CW}px;height:{CH}px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:8px"><img src="file://{R}{v["svg"]}" style="max-width:100%;max-height:100%"></div>'
        h+='</div></body>'
        open('/tmp/thumbs.html','w').write(h)
        pg.goto('file:///tmp/thumbs.html');pg.wait_for_function('[...document.images].every(i=>i.complete)',timeout=90000)
        for a,v in part:
            pg.locator(f'[id="c{a["assetId"]}"]').screenshot(path=R+f'assets/thumbs/{a["assetId"]}.png',omit_background=True)
        print(s+len(part),'/',len(todo),flush=True)
    b.close()
for a,v in todo:a['thumb']=f'assets/thumbs/{a["assetId"]}.png'
json.dump(j,open(R+'catalog/assets.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('done')
