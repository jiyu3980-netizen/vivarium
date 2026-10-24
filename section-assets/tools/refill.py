#!/usr/bin/env python3
"""지정한 에셋만 *.fill.svg 를 다시 만든다. usage: python3 refill.py <assetId> ..."""
import sys,json
import make_fills as F
J=json.load(open(F.ROOT+'/catalog/assets.json'));ids=set(sys.argv[1:])
for a in J['assets']:
    if a['assetId'] not in ids:continue
    for k in('front','leftSide','rightSide'):
        v=a['views'].get(k)
        if v:
            rel,out=F.work((v['svg'],v['svg'].replace('.svg','.fill.svg'),F.rules_for(a,k,v)));v['fill']=out
json.dump(J,open(F.ROOT+'/catalog/assets.json','w'),ensure_ascii=False,indent=1);print('ok',ids)
