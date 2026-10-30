#!/usr/bin/env python3
"""에셋 검증(읽기 전용): 중복 ID, 누락 파일, 잘못된 경로, 미등록 폴더, 썸네일 누락, 큰 SVG 경고.
usage: python3 validate_assets.py        (문제가 있으면 종료코드 1)"""
import json,os,re,collections,sys
R=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))+'/'
A=json.load(open(R+'catalog/assets.json',encoding='utf-8'))['assets']
CATS={c['id'] for c in json.load(open(R+'catalog/category-config.json',encoding='utf-8'))['categories']}
err=[];warn=[]
ids=collections.Counter(a['assetId'] for a in A)
err+=[f'중복 ID: {i} ×{n}' for i,n in ids.items() if n>1]
used=set()
for a in A:
    i=a['assetId']
    if not re.fullmatch(r'[a-z0-9][a-z0-9\-_.]*',i):warn.append(f'{i}: ID 에 소문자/숫자/-_. 외 문자')
    if a.get('categoryId') not in CATS:warn.append(f'{i}: 알 수 없는 categoryId {a.get("categoryId")}')
    nv=0
    for k,v in a['views'].items():
        if not v:continue
        nv+=1
        for f in('svg','fill'):
            p=v.get(f)
            if not p:
                if f=='svg':err.append(f'{i}/{k}: svg 경로 없음')
                else:warn.append(f'{i}/{k}: fill 없음(면 채움 불가)')
                continue
            used.add(p)
            if p!=f'assets/svg/{i}/{os.path.basename(p)}':err.append(f'{i}/{k}: 경로 규칙 위반 {p}')
            if not os.path.isfile(R+p):err.append(f'{i}/{k}: 파일 없음 {p}')
            elif f=='svg' and os.path.getsize(R+p)>400*1024:warn.append(f'{i}/{k}: SVG {os.path.getsize(R+p)//1024}KB (복잡)')
    if nv:
        t=a.get('thumb')
        if not t or not os.path.isfile(R+t):err.append(f'{i}: 썸네일 없음(목록이 원본 SVG 를 직접 읽게 됨) → make_thumbs.py')
for ev in(a.get('extraViews') or {} for a in A):
    for v in ev.values():used.add(v.get('svg'))
d=R+'assets/svg'
low={x.lower() for x in os.listdir(d)}
reg={a['assetId'] for a in A}
for x in sorted(os.listdir(d)):
    if x not in reg:warn.append(f'미등록 폴더: assets/svg/{x} → add_asset.py')
    if any(c.isupper() for c in x):warn.append(f'대문자 폴더명(대소문자 구분 서버에서 깨질 수 있음): {x}')
print(f'에셋 {len(A)}개 · 오류 {len(err)} · 경고 {len(warn)}')
for m in err:print('오류',m)
for m in warn[:60]:print('경고',m)
if len(warn)>60:print(f'경고 … 외 {len(warn)-60}건')
sys.exit(1 if err else 0)
