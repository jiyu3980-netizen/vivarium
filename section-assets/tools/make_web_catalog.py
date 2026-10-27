#!/usr/bin/env python3
"""catalog/assets.json → catalog/assets.web.json (웹사이트가 실제로 쓰는 항목만 남긴 가벼운 사본).
사이트는 assets.web.json 을 먼저 읽고, 없으면 assets.json 을 읽는다. 에셋을 추가·수정(build_library / add_asset / make_fills)한 뒤에는 이 스크립트를 다시 실행한다.
사용: python3 tools/make_web_catalog.py   (section-assets 폴더에서)"""
import json,os,sys
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
KEEP=['assetId','categoryId','subcategoryId','nameKo','nameEn','tags','thumb','status','stairAsset','defaultSizeCm','reviewReasons']
VK=['svg','fill','aspect','sourceBlock']   # 사이트 코드가 실제로 읽는 항목만
def slim(a):
    o={k:a[k] for k in KEEP if k in a}
    o['views']={k:({x:v[x] for x in VK if x in v} if v else None) for k,v in a.get('views',{}).items()}
    return o
J=json.load(open(R+'/catalog/assets.json',encoding='utf-8'))
W={'version':J.get('version'),'generated':J.get('generated'),'count':len(J['assets']),'slim':True,'assets':[slim(a) for a in J['assets']]}
open(R+'/catalog/assets.web.json','w',encoding='utf-8').write(json.dumps(W,ensure_ascii=False,separators=(',',':')))
print('assets.web.json',os.path.getsize(R+'/catalog/assets.web.json'),'bytes /',len(W['assets']),'assets')
